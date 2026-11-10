"use client";

import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { useToast } from "@/components/ui/Toast";

// ❤️ Volg deze opdrachtgever (favoriet): een push bij elke nieuwe openbare dienst (lib/worker/follows).
// Twee uitvoeringen op dezelfde pagina (rond hartje bovenin, knop bij "Over de opdrachtgever") houden
// elkaar bij via een venster-event. Bij toevoegen volgt een melding "toegevoegd aan je favorieten".
const EVENT = "zf-volgen-gewijzigd";

export function FollowEmployerButton({
  tenantId,
  name,
  initialFollowing,
  variant = "knop",
}: {
  tenantId: string;
  name: string;
  initialFollowing: boolean;
  variant?: "knop" | "hart";
}) {
  const t = useFT().follow;
  const toast = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const op = (e: Event) => {
      const d = (e as CustomEvent<{ tenantId: string; following: boolean }>).detail;
      if (d.tenantId === tenantId) setFollowing(d.following);
    };
    window.addEventListener(EVENT, op);
    return () => window.removeEventListener(EVENT, op);
  }, [tenantId]);

  const toggle = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/me/volgen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, follow: !following }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? t.failed);
        return;
      }
      const nu = !following;
      setFollowing(nu);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { tenantId, following: nu } }));
      if (nu) toast.success(t.added);
      else toast.info(t.removed);
    } finally {
      setBusy(false);
    }
  };

  const aria = following ? t.unfollowAria(name) : t.followAria(name);

  if (variant === "hart") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        aria-label={aria}
        className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur transition hover:scale-110 disabled:opacity-60"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill={following ? "currentColor" : "none"} className={following ? "text-crit" : "text-neutralx-600"} aria-hidden>
          <path
            d="M12 20s-7-4.4-9.2-8.5C1.3 8.7 2.8 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.2 0 4.7 3.2 3.2 6C19 15.6 12 20 12 20Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      aria-label={aria}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        following ? "border-brand-200 bg-brand-50 text-brand-700" : "border-hairstrong text-ink hover:bg-paper-soft"
      }`}
    >
      <span aria-hidden>{following ? "❤️" : "🤍"}</span>
      {following ? t.following : t.follow}
    </button>
  );
}
