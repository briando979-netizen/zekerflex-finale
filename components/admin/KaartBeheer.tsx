"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, Pill } from "@/components/admin/kit";
import { plekSoortNl, type Aanmelding } from "@/lib/kaart/aanmelden";

const TONE = { wacht: "warn", goedgekeurd: "ok", afgewezen: "crit" } as const;
const LABEL = { wacht: "Wacht op jou", goedgekeurd: "Op de kaart", afgewezen: "Afgewezen" } as const;

// Aanmeldingen van bedrijven voor ZekerFlex Kaart nakijken: goedkeuren (komt op de kaart) of afwijzen met een reden.
export function KaartBeheer({ aanmeldingen }: { aanmeldingen: Aanmelding[] }) {
  const router = useRouter();
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  async function zet(tenantId: string, status: "goedgekeurd" | "afgewezen") {
    let reden = "";
    if (status === "afgewezen") {
      reden = window.prompt("Waarom wijs je af? Het bedrijf leest dit en kan het aanpassen.") ?? "";
      if (reden.trim().length < 3) return;
    }
    setBezig(tenantId);
    setMelding(null);
    const res = await fetch("/api/admin/kaart", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, status, reden }) });
    const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    setBezig(null);
    if (!res.ok) {
      setMelding({ ok: false, tekst: d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw." });
      return;
    }
    setMelding({ ok: true, tekst: status === "goedgekeurd" ? "Goedgekeurd: het bedrijf staat op de kaart." : "Afgewezen: het bedrijf ziet je reden." });
    router.refresh();
  }

  if (aanmeldingen.length === 0) return <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen aanmeldingen. Bedrijven melden zich aan via Werkgever → Zet je bedrijf op de kaart.</p>;

  return (
    <div className="space-y-3">
      {melding && <Notice tone={melding.ok ? "ok" : "crit"} role={melding.ok ? "status" : "alert"}>{melding.tekst}</Notice>}
      <ul className="space-y-3">
        {aanmeldingen.map((a) => (
          <li key={a.tenantId} className="rounded-xl p-3 text-[0.8125rem]" style={{ border: "1px solid var(--a-border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium" style={{ color: "var(--a-text)" }}>{a.naam}</span>
                <span style={{ color: "var(--a-mute)" }}> · {plekSoortNl(a.soort)} · {a.adres}</span>
              </span>
              <Pill tone={TONE[a.status]}>{LABEL[a.status]}</Pill>
            </div>
            {a.omschrijving && <p className="mt-1" style={{ color: "var(--a-dim)" }}>{a.omschrijving}</p>}
            <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
              {a.website ? <>Website: <a href={a.website} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>{a.website} ↗</a></> : "Geen website"}
              {a.telefoon ? ` · telefoon ${a.telefoon} (openbaar, met toestemming)` : ""}
            </p>
            {a.status === "afgewezen" && a.reden && <p className="mt-1 text-xs" style={{ color: "var(--a-crit)" }}>Reden: {a.reden}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={`/kaart#kaart=17/${a.lat}/${a.lon}`} target="_blank" rel="noopener noreferrer" className="a-button text-xs">Bekijk op de kaart ↗</a>
              {a.status !== "goedgekeurd" && <button type="button" disabled={bezig === a.tenantId} className="a-button a-button-primary text-xs" onClick={() => void zet(a.tenantId, "goedgekeurd")}>Goedkeuren</button>}
              {a.status !== "afgewezen" && <button type="button" disabled={bezig === a.tenantId} className="a-button text-xs" onClick={() => void zet(a.tenantId, "afgewezen")}>Afwijzen</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
