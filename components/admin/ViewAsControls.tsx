"use client";

import { useEffect, useState } from "react";

type Role = "freelancer" | "employer";
const LABEL: Record<Role, string> = { freelancer: "Werknemer", employer: "Opdrachtgever" };

async function call(body: Record<string, string>): Promise<{ ok: boolean; to?: string; message?: string }> {
  const res = await fetch("/api/admin/view-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, to: d.to } : { ok: false, message: d?.error?.message ?? "Mislukt." };
}

async function go(role: Role) {
  const r = await call({ action: "start", role });
  if (r.ok && r.to) window.location.href = r.to;
  else window.alert(r.message);
}

/** Admin topbar: "Bekijk als: Werknemer · Opdrachtgever". */
export function ViewAsSwitcher() {
  const [busy, setBusy] = useState<Role | null>(null);
  return (
    <span className="hidden items-center gap-1 rounded-full px-1.5 py-1 text-xs lg:inline-flex" style={{ border: "1px solid var(--a-border)" }}>
      <span className="px-1.5" style={{ color: "var(--a-mute)" }}>
        Bekijk als
      </span>
      {(["freelancer", "employer"] as const).map((r) => (
        <button
          key={r}
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy(r);
            await go(r);
            setBusy(null);
          }}
          className="rounded-full px-2.5 py-1 font-semibold transition hover:bg-black/5 disabled:opacity-50"
          style={{ color: "var(--a-text)" }}
        >
          {busy === r ? "…" : LABEL[r]}
        </button>
      ))}
    </span>
  );
}

/** Bar shown inside the werknemer-/opdrachtgever-dashboard while an admin views as someone. */
export function ViewAsBar({ role, name }: { role: Role; name: string }) {
  const other: Role = role === "freelancer" ? "employer" : "freelancer";
  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center gap-2 bg-[#3155D8] px-4 py-2 text-xs text-white">
      <span className="min-w-0 flex-1">
        👁 Je bekijkt dit als <strong>{name}</strong> ({LABEL[role].toLowerCase()}) — alleen-lezen, wijzigingen worden niet opgeslagen.
      </span>
      <button type="button" onClick={() => void go(other)} className="rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
        Wissel naar {LABEL[other].toLowerCase()}
      </button>
      <button
        type="button"
        onClick={async () => {
          await call({ action: "stop" });
          window.location.href = "/admin";
        }}
        className="rounded-full bg-white px-3 py-1 font-semibold text-[#3155D8]"
      >
        Terug naar admin
      </button>
    </div>
  );
}

/** Admin → Gebruikers → detail: make this account the example for a role. */
export function ChooseViewAsAccount({ userId, roles }: { userId: string; roles: Role[] }) {
  const [current, setCurrent] = useState<Partial<Record<Role, { userId: string }>>>({});
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/view-as", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCurrent(d.accounts ?? {}))
      .catch(() => undefined);
  }, []);
  if (roles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
      {roles.map((r) =>
        current[r]?.userId === userId ? (
          <span key={r} className="text-ok">
            ✓ Voorbeeld-{LABEL[r].toLowerCase()} voor &ldquo;Bekijk als&rdquo;
          </span>
        ) : (
          <button
            key={r}
            type="button"
            className="btn-ghost text-xs"
            onClick={async () => {
              const res = await call({ action: "choose", role: r, userId });
              if (res.ok) setCurrent((c) => ({ ...c, [r]: { userId } }));
              setNote(res.ok ? null : (res.message ?? null));
            }}
          >
            Gebruik als voorbeeld-{LABEL[r].toLowerCase()}
          </button>
        ),
      )}
      {note && <span className="text-xs text-crit">{note}</span>}
    </div>
  );
}
