"use client";

import { useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { useToast } from "@/components/ui/Toast";

// ❤️ Volg deze opdrachtgever: een push bij elke nieuwe openbare dienst (lib/worker/follows).
export function FollowEmployerButton({ tenantId, name, initialFollowing }: { tenantId: string; name: string; initialFollowing: boolean }) {
  const t = useFT().follow;
  const toast = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

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
      setFollowing(!following);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      aria-label={following ? t.unfollowAria(name) : t.followAria(name)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        following ? "border-brand-200 bg-brand-50 text-brand-700" : "border-hairstrong text-ink hover:bg-paper-soft"
      }`}
    >
      <span aria-hidden>{following ? "❤️" : "🤍"}</span>
      {following ? t.following : t.follow}
    </button>
  );
}
