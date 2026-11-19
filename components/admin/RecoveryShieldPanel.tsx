import Link from "next/link";
import { Notice, Panel, Pill, type Tone } from "@/components/admin/kit";
import type { HerstelNiveau, HerstelStand, HerstelUitslag } from "@/lib/ops/herstel-regels";

// Beheer → Beveiliging: ZekerFlex Recovery Shield. Eén antwoord op "kunnen we
// terug als het misgaat?" uit het back-uprapport (lib/ops/herstel-regels.ts).
// De details en de knoppen staan bij Systeem, Back-ups. Servercomponent.

const TONE: Record<HerstelUitslag, Tone> = { ok: "ok", "let-op": "warn", probleem: "crit" };
const WOORD: Record<HerstelUitslag, string> = { ok: "In orde", "let-op": "Let op", probleem: "Probleem" };
const NIVEAU: Record<HerstelNiveau, { tekst: string; tone: Tone }> = {
  sterk: { tekst: "Sterk", tone: "ok" },
  redelijk: { tekst: "Redelijk", tone: "warn" },
  kwetsbaar: { tekst: "Kwetsbaar", tone: "crit" },
  onbekend: { tekst: "Onbekend", tone: "neutral" },
};

export function RecoveryShieldPanel({ stand }: { stand: HerstelStand }) {
  const n = NIVEAU[stand.niveau];
  return (
    <Panel
      title="ZekerFlex Recovery Shield"
      subtitle="Kunnen we terug als het misgaat? Zes controles, van de nachtelijke back-up tot een kopie die ook een inbreker niet kan wissen."
      actions={
        <Link href="/admin/systeem" className="a-button text-xs">
          Back-ups bekijken
        </Link>
      }
    >
      {stand.niveau === "onbekend" ? (
        <Notice>Op deze omgeving draait geen back-updienst, dus hier valt niets te controleren.</Notice>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-[0.875rem]" style={{ color: "var(--a-text)" }}>
            <Pill tone={n.tone}>{n.tekst}</Pill>
            {stand.goed} van de {stand.totaal} controles in orde
          </p>
          <ul className="mt-3">
            {stand.controles.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 py-2.5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="w-24 shrink-0">
                  <Pill tone={TONE[c.uitslag]}>{WOORD[c.uitslag]}</Pill>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{c.titel}</span>
                  <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{c.uitleg}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
