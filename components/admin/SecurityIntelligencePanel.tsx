import { Feed, KpiStrip, Panel, Pill } from "@/components/admin/kit";
import { count, dateTimeNl, timeAgoNl } from "@/lib/admin/format";
import type { BeveiligingsBeeld } from "@/lib/security/intelligence";

// Beheer → Beveiliging: ZekerFlex Security Intelligence. De signalen die los
// bestonden bij elkaar: mislukte inlogpogingen, inlogslots, beveiligingsacties
// uit het auditlogboek, de meldingen aan de eigenaar, en of het auditlogboek
// zelf nog klopt (nachtelijke controle van de hashketen). Servercomponent.

export function SecurityIntelligencePanel({ beeld, now }: { beeld: BeveiligingsBeeld; now: Date }) {
  const { telling, keten } = beeld;
  const ketenTekst = !keten ? "nog niet gecontroleerd" : keten.ok ? `${count(keten.checked)} regels kloppen` : `klopt niet vanaf regel ${keten.firstBreakSeq ?? "?"}`;
  return (
    <Panel
      title="ZekerFlex Security Intelligence"
      subtitle={`Alle beveiligingssignalen van de laatste ${beeld.dagen} dagen bij elkaar. De aanvallen die de server zelf tegenhoudt, staan hieronder bij Aanvalsbescherming.`}
    >
      <KpiStrip
        items={[
          { label: "Mislukte inlogpogingen", value: count(telling.mislukt24u), hint: "laatste 24 uur", tone: telling.mislukt24u >= 50 ? "warn" : "neutral" },
          { label: "Accounts op slot", value: count(telling.slot24u), hint: "na te veel pogingen, 24 uur", tone: telling.slot24u > 0 ? "warn" : "ok" },
          { label: "Beveiligingsacties", value: count(telling.beveiliging), hint: `${count(telling.ernstig)} met een waarschuwing`, tone: telling.ernstig > 0 ? "warn" : "ok" },
          { label: "Auditlogboek", value: !keten ? "—" : keten.ok ? "Klopt" : "Aangepast", hint: ketenTekst, tone: !keten ? "neutral" : keten.ok ? "ok" : "crit" },
        ]}
      />
      {keten && (
        <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
          Het auditlogboek wordt elke nacht nagerekend: elke regel is met een rekensom aan de vorige vastgemaakt, dus een gewijzigde of verwijderde regel valt op. Laatste controle {timeAgoNl(keten.at, now.getTime())}.
        </p>
      )}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>Tijdlijn</p>
          <Feed
            emptyText="Geen beveiligingssignalen in deze periode."
            items={beeld.tijdlijn.map((t) => ({ key: t.key, text: t.tekst, meta: dateTimeNl(t.at, now), tone: t.ernstig ? "warn" : "neutral" }))}
          />
        </div>
        <div>
          <p className="mb-2 text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>Meldingen aan jou</p>
          <Feed
            emptyText="Nog geen meldingen."
            items={beeld.meldingen.map((m) => ({
              key: `${m.key}:${m.at}`,
              text: (
                <>
                  <Pill tone={m.severity === "critical" ? "crit" : "warn"}>{m.severity === "critical" ? "Dringend" : "Let op"}</Pill> {m.title}
                </>
              ),
              meta: dateTimeNl(m.at, now),
              href: m.url,
            }))}
          />
        </div>
      </div>
    </Panel>
  );
}
