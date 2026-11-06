import { KpiStrip, Notice, Panel } from "@/components/admin/kit";
import { DataTable } from "@/components/admin/kit-client";
import { DeblokkeerKnop } from "@/components/admin/DeblokkeerKnop";
import { count, timeAgoNl } from "@/lib/admin/format";
import { beveiligingOverzicht, crowdsecIngesteld } from "@/lib/ops/crowdsec";
import { duurTekst, meldingAdres, scenarioTekst, vlagVan } from "@/lib/ops/crowdsec-tekst";

/**
 * Admin → Beveiliging: wat de aanvalsbescherming (CrowdSec, deploy/crowdsec) nu doet —
 * actieve blokkades, de meldingen van de laatste 24 uur en per adres een knop om de
 * blokkade op te heffen. Alleen voor platformbeheerders (de pagina regelt dat).
 */
export async function AanvalsbeschermingPanel() {
  if (!crowdsecIngesteld()) {
    return (
      <Panel title="Aanvalsbescherming" subtitle="Scanners, brute force en bekende aanvallers automatisch buiten de deur">
        <Notice>
          Niet op deze omgeving: de CrowdSec-engine draait op de server naast Caddy (deploy/crowdsec, <code>installeer.sh</code>) en de
          app leest mee zodra <code>CROWDSEC_LAPI_URL</code> en <code>CROWDSEC_BOUNCER_KEY</code> in <code>.env.production</code> staan.
        </Notice>
      </Panel>
    );
  }

  const o = await beveiligingOverzicht();
  if (!o || !o.ok) {
    return (
      <Panel title="Aanvalsbescherming" subtitle="Scanners, brute force en bekende aanvallers automatisch buiten de deur">
        <Notice tone="crit" role="alert">
          De CrowdSec-engine reageert niet{o?.fout ? ` (${o.fout})` : ""}. Kijk op de server: <code>docker compose … logs crowdsec</code>.
        </Notice>
      </Panel>
    );
  }

  const now = new Date();
  const geblokkeerd = new Set(o.geblokkeerd);
  const rows = o.meldingen.slice(0, 60).map((m) => {
    const adres = meldingAdres(m);
    const duur = m.decisions?.[0]?.duration;
    const nogActief = geblokkeerd.has(adres);
    return {
      id: String(m.id),
      cells: {
        wanneer: timeAgoNl(m.created_at, now.getTime()),
        adres: (
          <span className="font-mono text-xs">
            {adres}
            <span className="ml-2 font-sans" style={{ color: "var(--a-mute)" }}>
              {vlagVan(m.source?.cn)} {m.source?.cn ?? ""}
              {m.source?.as_name ? ` · ${m.source.as_name}` : ""}
            </span>
          </span>
        ),
        wat: (
          <span>
            {scenarioTekst(m.scenario)}
            <span className="block font-mono text-[11px]" style={{ color: "var(--a-mute)" }}>
              {m.scenario}
              {m.events_count ? ` · ${count(m.events_count)} verzoeken` : ""}
            </span>
          </span>
        ),
        blokkade: nogActief ? duurTekst(duur) : "verlopen of opgeheven",
        actie: nogActief ? <DeblokkeerKnop ip={adres} /> : null,
      },
      sort: { wanneer: Date.parse(m.created_at), adres, wat: m.scenario, blokkade: nogActief ? 1 : 0 },
      search: `${adres} ${m.scenario} ${m.source.cn ?? ""} ${m.source.as_name ?? ""}`,
      filters: { staat: nogActief ? "actief" : "voorbij" },
      csv: { wanneer: m.created_at, adres, land: m.source.cn ?? "", netwerk: m.source.as_name ?? "", scenario: m.scenario },
    };
  });

  const s = o.blokkades;
  return (
    <div className="space-y-4">
      <KpiStrip
        items={[
          { label: "Nu geblokkeerd", value: count(s.totaal), hint: "adressen krijgen geen antwoord", tone: "ok" },
          { label: "Eigen detecties", value: count(s.eigen + s.handmatig), hint: "uit onze eigen logs", tone: s.eigen + s.handmatig > 0 ? "warn" : "ok" },
          { label: "Community-lijst", value: count(s.community), hint: "bekende aanvallers wereldwijd" },
          { label: "Meldingen 24 u", value: count(o.meldingen.length), hint: o.meldingenFout ? "meldingen niet te lezen" : "adressen die zich als aanvaller gedroegen", ...(o.meldingenFout ? { tone: "crit" as const } : {}) },
        ]}
      />
      {o.meldingenFout && (
        <Notice tone="warn">
          De meldingen zijn niet te lezen: {o.meldingenFout}. De blokkades werken wel; controleer <code>CROWDSEC_MACHINE_ID</code> en{" "}
          <code>CROWDSEC_MACHINE_PASSWORD</code> (deploy/crowdsec/installeer.sh).
        </Notice>
      )}
      <Panel
        flush
        title="Aanvalsbescherming"
        subtitle="Meldingen van de laatste 24 uur. Een blokkade duurt standaard 4 uur; de firewall op de server volgt binnen 10 seconden."
        footer={
          <>
            CrowdSec in de container <code>crowdsec</code> leest de toegangslog van Caddy (zonder cookies of sleutels, 7 dagen) en het ssh-log; de
            firewall-bouncer op de server blokkeert op alle poorten. Eigen server en de computer van de eigenaar staan op de uitzonderingslijst
            (deploy/crowdsec/README.md).
            {s.perScenario.length > 0 && (
              <>
                {" "}
                Eigen blokkades nu: {s.perScenario.map((p) => `${scenarioTekst(p.scenario).toLowerCase()} ${p.aantal}`).join(", ")}.
              </>
            )}
          </>
        }
      >
        <DataTable
          columns={[
            { key: "wanneer", label: "Wanneer", sortable: true },
            { key: "adres", label: "Adres", sortable: true },
            { key: "wat", label: "Wat het deed", sortable: true },
            { key: "blokkade", label: "Blokkade", sortable: true, hideOnMobile: true },
            { key: "actie", label: "", align: "right" },
          ]}
          rows={rows}
          filters={[{ key: "staat", label: "Blokkade", chips: true, options: [{ value: "actief", label: "Actief" }, { value: "voorbij", label: "Voorbij" }] }]}
          searchPlaceholder="Zoek op adres, land of soort"
          defaultSort={{ key: "wanneer", dir: "desc" }}
          csvName="aanvalsmeldingen"
          emptyText="Geen meldingen in de laatste 24 uur: niemand gedroeg zich als aanvaller."
        />
      </Panel>
    </div>
  );
}
