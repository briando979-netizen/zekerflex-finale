import { getPrincipal, hasRole } from "@/lib/auth";
import { Empty, KpiStrip, NameCell, PageHead, Panel, Pill } from "@/components/admin/kit";
import { KvkHandmatigActie } from "@/components/admin/KvkHandmatigActie";
import { dateNl } from "@/lib/admin/format";
import { kvkControleOverzicht, type KvkWachtRij } from "@/lib/kvk/handmatig-server";
import { handmatigRegel, isActief, terugdraaiRegel } from "@/lib/kvk/handmatig";
import { tegoedLaag } from "@/lib/kvk/tegoed";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Admin → Mensen & bedrijven → KVK-controle (22 nov 2026). Het tegoed bij KVKBase is op: de eigenaar zoekt een KVK-nummer zelf
// op kvk.nl/zoeken (gratis) en keurt het hier goed, voor een werker die op de controle wacht ("kvk-wacht") of voor een bedrijf.
// Per werker alleen de naam en het opgegeven KVK-nummer: geen BSN en geen ID-gegevens. Zie lib/kvk/handmatig.ts.
// ---------------------------------------------------------------------------

function WachtLijst({ rijen }: { rijen: KvkWachtRij[] }) {
  return (
    <ul>
      {rijen.map((r) => (
        <li key={`${r.soort}:${r.id}`} className="space-y-3 px-4 py-3.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <NameCell
              name={r.naam}
              href={r.href}
              sub={
                <>
                  KVK <span className="font-mono">{r.kvkNumber}</span>
                  {r.sinds ? ` · wacht sinds ${dateNl(r.sinds)}` : ""}
                </>
              }
            />
            <Pill tone={r.tone}>{r.label}</Pill>
          </div>
          <KvkHandmatigActie soort={r.soort} id={r.id} actie="goedkeuren" kvkNumber={r.kvkNumber} naam={r.naam} />
        </li>
      ))}
    </ul>
  );
}

export default async function KvkControlePage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }

  const o = await kvkControleOverzicht();
  const actief = o.gedaan.filter((g) => isActief(g.record)).length;
  const tegoed = o.tegoed;

  return (
    <div className="space-y-4">
      <PageHead
        title="KVK-controle"
        subtitle="KVK-nummers die wachten op een controle, en de goedkeuringen die je met de hand deed. Dit gebruikt geen tegoed bij KVKBase."
      />

      <KpiStrip
        items={[
          { label: "Werkers wachten", value: String(o.werkers.length), tone: o.werkers.length > 0 ? "warn" : "ok", hint: "KVK-nummer ingevuld, nog niet gecontroleerd" },
          { label: "Bedrijven wachten", value: String(o.bedrijven.length), tone: o.bedrijven.length > 0 ? "warn" : "ok", hint: "de controle kon niet bij de KVK" },
          { label: "Met de hand goedgekeurd", value: String(actief), tone: "trust", hint: "nog geldig, terug te draaien" },
          { label: "KVKBase-tegoed", value: tegoed ? (tegoed.op ? "Op" : tegoed.tokens === null ? "Onbekend" : String(tegoed.tokens)) : "Niet gemeten", tone: tegoedLaag(tegoed) ? "crit" : "neutral", hint: "dit scherm gebruikt het niet" },
        ]}
      />

      <Panel title="Zo keur je een KVK-nummer goed" subtitle="Drie stappen, zonder iets bij KVKBase op te vragen">
        <ol className="list-decimal space-y-1 pl-5 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
          <li>Zoek het KVK-nummer op kvk.nl/zoeken (gratis). Onder “Goedkeuren met de hand” staat een link die het nummer alvast invult.</li>
          <li>Kijk of de inschrijving bestaat en actief is, en let op de naam.</li>
          <li>Klik op “Goedkeuren met de hand”, vul het nummer, de naam en een reden in, en bevestig dat je het op kvk.nl zag.</li>
        </ol>
      </Panel>

      <Panel flush title="Werkers die op een KVK-controle wachten" subtitle={`${o.werkers.length} ${o.werkers.length === 1 ? "werker" : "werkers"}: alleen de naam en het opgegeven KVK-nummer`}>
        {o.werkers.length === 0 ? <Empty title="Geen wachtende werkers" body="Iedereen met een KVK-nummer is gecontroleerd." /> : <WachtLijst rijen={o.werkers} />}
      </Panel>

      <Panel flush title="Bedrijven die op een KVK-controle wachten" subtitle="Een bedrijf dat niet is gecontroleerd kan één testklus plaatsen; na je goedkeuring onbeperkt">
        {o.bedrijven.length === 0 ? (
          <Empty title="Geen wachtende bedrijven" body="Een bedrijf zonder wacht vind je ook op zijn eigen scherm onder Mensen & bedrijven → Bedrijven." />
        ) : (
          <WachtLijst rijen={o.bedrijven} />
        )}
      </Panel>

      <Panel flush title="Met de hand gecontroleerd" subtitle="Wie wat goedkeurde, wanneer en waarom. Terugdraaien kan hier of op het scherm zelf.">
        {o.gedaan.length === 0 ? (
          <Empty title="Nog niets met de hand goedgekeurd" body="Zodra je een KVK-nummer goedkeurt, staat hier wie het deed en wanneer." />
        ) : (
          <ul>
            {o.gedaan.map((g) => {
              const aan = isActief(g.record);
              return (
                <li key={`${g.soort}:${g.id}`} className="space-y-2 px-4 py-3.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <NameCell
                      name={g.naam}
                      href={g.href}
                      sub={
                        <>
                          {g.soort === "werker" ? "Werker" : "Bedrijf"}, KVK <span className="font-mono">{g.record.kvkNumber}</span>, naam op kvk.nl: {g.record.naam}
                        </>
                      }
                    />
                    <Pill tone={aan ? "trust" : "neutral"}>{aan ? "Handmatig gecontroleerd" : "Teruggedraaid"}</Pill>
                  </div>
                  <p style={{ color: "var(--a-dim)" }}>
                    {handmatigRegel(g.record)}. Reden: {g.record.notitie}
                  </p>
                  {g.record.teruggedraaid && (
                    <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                      {terugdraaiRegel(g.record.teruggedraaid)}
                    </p>
                  )}
                  {aan && !g.nogGeldig && (
                    <p className="text-xs" style={{ color: "var(--a-warn-ink)" }}>
                      De geldigheid staat er nu niet meer op: het nummer is veranderd, of de controle is intussen opnieuw gedaan.
                    </p>
                  )}
                  {aan && <KvkHandmatigActie soort={g.soort} id={g.id} actie="terugdraaien" />}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
