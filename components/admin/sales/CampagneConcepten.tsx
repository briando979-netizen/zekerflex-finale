"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Beheer → Sales → campagne → paneel "Wacht op jou": de concepten van deze campagne die nog op een mens wachten.
// "Verstuur nu" en "Weggooien" gebruiken de bestaande route PATCH /api/admin/sales/outreach/[id]; na een actie komt de
// lijst opnieuw van de server (router.refresh), zodat hier nooit een eigen, afwijkende stand staat.

export interface ConceptDto {
  id: string;
  status: string;
  bedrijf: string;
  aan: string | null;
  onderwerp: string;
  tekst: string;
  /** uit de vaste tekst van de campagne, of door de computer per bedrijf geschreven */
  vasteTekst: boolean;
  bewerkt: boolean;
}

const UITSLAG: Record<string, string> = {
  suppressed: "Niet verstuurd: dit adres staat op de lijst van adressen die we niet mailen.",
  skipped: "Niet verstuurd.",
  failed: "Niet verstuurd.",
};

export function CampagneConcepten({ concepten }: { concepten: ConceptDto[] }) {
  const router = useRouter();
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);

  async function doe(c: ConceptDto, action: "send" | "discard") {
    if (action === "send" && !window.confirm(`De mail nu versturen naar ${c.bedrijf}${c.aan ? ` (${c.aan})` : ""}?`)) return;
    setBezig(`${c.id}:${action}`);
    setMelding(null);
    try {
      const r = await fetch(`/api/admin/sales/outreach/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = (await r.json().catch(() => null)) as { outcome?: { status?: string; reason?: string }; error?: { message?: string } } | null;
      if (!r.ok) {
        setMelding({ tekst: d?.error?.message ?? "De actie is niet gelukt. Probeer het opnieuw.", fout: true });
      } else if (action === "discard") {
        setMelding({ tekst: `Het concept voor ${c.bedrijf} is weggegooid.`, fout: false });
      } else if (d?.outcome?.status === "sent") {
        setMelding({ tekst: `De mail naar ${c.bedrijf} is verstuurd.`, fout: false });
      } else {
        const soort = d?.outcome?.status ?? "failed";
        setMelding({ tekst: `${UITSLAG[soort] ?? "Niet verstuurd."}${d?.outcome?.reason ? ` Reden: ${d.outcome.reason}.` : ""}`, fout: true });
      }
      router.refresh();
    } catch {
      setMelding({ tekst: "De actie is niet gelukt: geen verbinding. Probeer het opnieuw.", fout: true });
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="space-y-3">
      {melding && (
        <p
          role={melding.fout ? "alert" : "status"}
          className="rounded-lg px-4 py-2.5 text-[0.8125rem]"
          style={melding.fout ? { background: "var(--a-crit-soft)", color: "var(--a-text)", boxShadow: "inset 3px 0 0 var(--a-crit)" } : { background: "var(--a-elev)", color: "var(--a-dim)" }}
        >
          {melding.tekst}
        </p>
      )}
      {concepten.length === 0 ? (
        <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
          Er wacht nu niets op jou. Nieuwe concepten komen hier zodra de motor draait (of klik bij de campagne op &quot;Nu draaien&quot;).
        </p>
      ) : (
        <ul className="space-y-3">
          {concepten.map((c) => (
            <li key={c.id} className="rounded-lg p-4" style={{ background: "var(--a-panel-2)", border: "1px solid var(--a-border)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{c.bedrijf}</p>
                <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                  {c.aan ?? "geen mailadres"} · {c.vasteTekst ? "vaste tekst" : "door de computer geschreven"}
                  {c.bewerkt ? " · door jou aangepast" : ""}
                  {c.status === "APPROVED" ? " · goedgekeurd" : ""}
                </p>
              </div>
              <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>{c.onderwerp}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs" style={{ color: "var(--a-mute)" }}>Lees de hele mail</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--a-dim)" }}>{c.tekst}</p>
              </details>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void doe(c, "send")}
                  disabled={bezig !== null || !c.aan}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
                  style={{ background: "var(--a-accent)", color: "var(--a-on-accent)", border: "1px solid var(--a-border)" }}
                >
                  {bezig === `${c.id}:send` ? "Bezig…" : "Verstuur nu"}
                </button>
                <button
                  type="button"
                  onClick={() => void doe(c, "discard")}
                  disabled={bezig !== null}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
                  style={{ background: "var(--a-panel)", color: "var(--a-dim)", border: "1px solid var(--a-border)" }}
                >
                  {bezig === `${c.id}:discard` ? "Bezig…" : "Weggooien"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
