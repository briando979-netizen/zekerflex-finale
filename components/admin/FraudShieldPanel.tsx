import Link from "next/link";
import { Empty, KpiStrip, Panel, Pill, type Tone } from "@/components/admin/kit";
import { count } from "@/lib/admin/format";
import type { FraudeOverzicht } from "@/lib/fraud/account";
import type { RisicoNiveau } from "@/lib/fraud/account-regels";

// Beheer → Fraude: ZekerFlex FraudShield. Eén risicoscore per account uit de
// signalen die al werden bijgehouden (lib/fraud/account.ts). Servercomponent.

const TONE: Record<RisicoNiveau, Tone> = { hoog: "crit", verhoogd: "warn", laag: "neutral" };
const LABEL: Record<RisicoNiveau, string> = { hoog: "Hoog", verhoogd: "Verhoogd", laag: "Laag" };

export function FraudShieldPanel({ overzicht }: { overzicht: FraudeOverzicht }) {
  return (
    <Panel
      title="ZekerFlex FraudShield"
      subtitle="Eén risicoscore per account, opgebouwd uit gedeelde toestellen, hetzelfde identiteitsbewijs of rekeningnummer bij meer accounts, een gewijzigd rekeningnummer, de zwarte lijst en opvallende patronen met één opdrachtgever. Een signaal om naar te kijken: niemand wordt vanzelf geblokkeerd."
    >
      <KpiStrip
        items={[
          { label: "Hoog risico", value: count(overzicht.hoog), hint: "score 60 of hoger", tone: overzicht.hoog > 0 ? "crit" : "ok" },
          { label: "Verhoogd risico", value: count(overzicht.verhoogd), hint: "score 30 tot 60", tone: overzicht.verhoogd > 0 ? "warn" : "ok" },
          { label: "Accounts met een signaal", value: count(overzicht.bekeken), hint: "testaccounts tellen niet mee" },
        ]}
      />
      {overzicht.accounts.length === 0 ? (
        <div className="mt-4">
          <Empty title="Geen accounts met een fraudesignaal" body="Zodra twee accounts een toestel, identiteitsbewijs of rekeningnummer delen, staat het hier." />
        </div>
      ) : (
        <ul className="mt-4">
          {overzicht.accounts.map((a) => (
            <li key={a.userId} className="flex flex-wrap items-start gap-3 py-3" style={{ borderTop: "1px solid var(--a-border)" }}>
              <div className="w-14 shrink-0 text-right">
                <span className="text-[1.05rem] font-semibold" style={{ color: "var(--a-text)" }}>{a.score}</span>
                <span className="block text-[11px]" style={{ color: "var(--a-mute)" }}>van 100</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[0.875rem] font-medium" style={{ color: "var(--a-text)" }}>
                  <Link href={`/admin/gebruikers/${a.userId}`} className="hover:underline">
                    {a.naam}
                  </Link>
                  <Pill tone={TONE[a.niveau]}>{LABEL[a.niveau]}</Pill>
                </p>
                <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--a-mute)" }}>
                  {a.redenen.map((r) => (
                    <li key={r.code}>
                      {r.label} <span aria-hidden>·</span> +{r.punten}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
