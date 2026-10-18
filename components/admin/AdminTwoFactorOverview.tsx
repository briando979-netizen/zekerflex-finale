"use client";

import { useState } from "react";

interface Person {
  id: string;
  name: string;
  email: string;
  roles: string[];
  twoFactor: boolean;
}

const ROLE: Record<string, string> = { PLATFORM_ADMIN: "Beheerder", HQ_ADMIN: "Werkgever (hoofdkantoor)", LOCAL_MANAGER: "Werkgever (vestiging)" };

/** Who has two-step verification on; reset for someone who lost phone + recovery codes. */
export function AdminTwoFactorOverview({ people, selfId }: { people: Person[]; selfId: string }) {
  const [list, setList] = useState(people);
  const [note, setNote] = useState<string | null>(null);
  const on = list.filter((p) => p.twoFactor).length;

  async function reset(p: Person) {
    if (!window.confirm(`Tweestapsverificatie van ${p.name} resetten? Doe dit alleen als je zeker weet dat het echt deze persoon is (bijv. via een videogesprek). ${p.name} moet het daarna opnieuw instellen.`)) return;
    const r = await fetch("/api/admin/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: p.id }) }).catch(() => null);
    if (r?.ok) {
      setList((l) => l.map((x) => (x.id === p.id ? { ...x, twoFactor: false } : x)));
      setNote(`Tweestapsverificatie van ${p.name} is gereset (vastgelegd in het auditlog).`);
    } else setNote("Resetten lukte niet.");
  }

  return (
    <section className="a-panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4" style={{ borderColor: "var(--a-border)" }}>
        <h2 className="font-display text-lg font-semibold">Beheerders en werkgevers</h2>
        <span className="text-sm" style={{ color: "var(--a-dim)" }}>
          {on} van {list.length} met tweestapsverificatie
        </span>
      </div>
      {note && <p className="px-5 pt-3 text-sm" style={{ color: "var(--a-dim)" }}>{note}</p>}
      <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium" style={{ color: "var(--a-text)" }}>
                {p.name} {p.id === selfId && <span style={{ color: "var(--a-mute)" }}>(jij)</span>}
              </span>
              <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                {p.email} · {p.roles.map((r) => ROLE[r] ?? r).join(", ")}
              </span>
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.twoFactor ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
              {p.twoFactor ? "✓ aan" : "uit"}
            </span>
            {p.twoFactor && p.id !== selfId && (
              <button type="button" onClick={() => void reset(p)} className="text-xs underline" style={{ color: "var(--a-mute)" }}>
                Resetten
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
