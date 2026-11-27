import { getPrincipal, hasRole } from "@/lib/auth";
import { Empty, KpiStrip, Notice, PageHead, Panel } from "@/components/admin/kit";
import { Tabs } from "@/components/admin/kit-client";
import { RegistratieActies, SalesPartnerToevoegen, SalesPartnerWeg } from "@/components/admin/SalesPartnerBeheer";
import { MODEL_B, MODEL_KORT, STATUS_LABEL, euro, laatsteMaanden, maandLabel, uren } from "@/lib/sales-partners/model";
import { beheerOverzicht } from "@/lib/sales-partners/overzicht";

export const dynamic = "force-dynamic";

const datum = (iso: string) => (iso ? new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric" }) : "");

// Beheer → Sales partners (27 nov 2026, opdracht van de eigenaar): recruiters op commissie (lib/sales-partners).
// Een partner registreert bedrijven op /partner en kiest per bedrijf Model A (€ 1,00 per gewerkt uur, 6 maanden) of
// Model B (€ 100 na 40 betaalde uren). Hier: partners toevoegen, registraties goedkeuren door ze aan een bedrijfsaccount
// te koppelen (pas dan tellen de uren), en het maandoverzicht per partner exporteren voor zijn zzp-factuur.
export default async function SalesPartnersBeheer() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Sales partners zijn alleen voor platformbeheerders." />;
  }
  const data = await beheerOverzicht().catch(() => null);
  if (!data) return <Notice tone="warn">Het overzicht van de sales partners kon nu niet worden geladen. Probeer het straks opnieuw.</Notice>;
  const { partners, rijen } = data;
  const naamVan = new Map(partners.map((p) => [p.userId, p.naam]));
  const teBeoordelen = rijen.filter((r) => r.uitkomst.status === "geregistreerd").length;
  const totaal = partners.reduce((s, p) => ({ verdiend: s.verdiend + p.kpi.verdiendCents, uitbetaalbaar: s.uitbetaalbaar + p.kpi.uitbetaalbaarCents }), { verdiend: 0, uitbetaalbaar: 0 });
  const gesorteerd = [...rijen].sort((a, b) => Date.parse(b.bedrijf.aangemaaktOp) - Date.parse(a.bedrijf.aangemaaktOp));

  const partnerTab = (
    <div className="space-y-4">
      <Panel title="Sales partner toevoegen" subtitle="De partner heeft eerst een gewoon account nodig. Daarna ziet hij de knop Partnerdashboard in de app en in het werkgeversmenu.">
        <SalesPartnerToevoegen />
      </Panel>
      <Panel title="Partners" flush>
        {partners.length === 0 ? (
          <Empty title="Nog geen sales partners" body="Voeg hierboven iemand toe op e-mailadres." />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[0.8125rem]">
              <thead style={{ color: "var(--a-mute)" }}>
                <tr>
                  <th className="px-4 py-2 font-medium">Partner</th>
                  <th className="px-4 py-2 font-medium">Sinds</th>
                  <th className="px-4 py-2 text-right font-medium">Bedrijven</th>
                  <th className="px-4 py-2 text-right font-medium">Actief</th>
                  <th className="px-4 py-2 text-right font-medium">Uren</th>
                  <th className="px-4 py-2 text-right font-medium">Verdiend</th>
                  <th className="px-4 py-2 text-right font-medium">Uitbetaalbaar</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.userId} style={{ borderTop: "1px solid var(--a-border)" }}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium" style={{ color: "var(--a-text)" }}>
                        {p.naam}
                      </p>
                      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                        {p.email}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">{datum(p.sinds)}</td>
                    <td className="num px-4 py-2.5 text-right">{p.kpi.bedrijven}</td>
                    <td className="num px-4 py-2.5 text-right">{p.kpi.actief}</td>
                    <td className="num px-4 py-2.5 text-right">{uren(p.kpi.minuten)}</td>
                    <td className="num px-4 py-2.5 text-right">{euro(p.kpi.verdiendCents)}</td>
                    <td className="num px-4 py-2.5 text-right">{euro(p.kpi.uitbetaalbaarCents)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <SalesPartnerWeg email={p.email} naam={p.naam} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  const leadsTab = (
    <Panel
      title="Bedrijfsleads"
      subtitle="Keur een registratie goed door hem te koppelen aan het bedrijfsaccount (KvK-nummer of bedrijfs-id uit Beheer → Bedrijven). Pas na het koppelen tellen de gewerkte uren mee voor de commissie."
      flush
    >
      {gesorteerd.length === 0 ? (
        <Empty title="Nog geen registraties" body="Zodra een partner een bedrijf registreert, staat het hier." />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[0.8125rem]">
            <thead style={{ color: "var(--a-mute)" }}>
              <tr>
                <th className="px-4 py-2 font-medium">Bedrijf</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Partner</th>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Uren</th>
                <th className="px-4 py-2 text-right font-medium">Verdiend</th>
                <th className="px-4 py-2 font-medium">Actie</th>
              </tr>
            </thead>
            <tbody>
              {gesorteerd.map(({ partnerId, bedrijf: b, uitkomst: u }) => (
                <tr key={b.id} className="align-top" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium" style={{ color: "var(--a-text)" }}>
                      {b.bedrijfsnaam}
                    </p>
                    <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                      {b.kvk ? `KvK ${b.kvk} · ` : ""}
                      {datum(b.aangemaaktOp)}
                    </p>
                    {b.tenantNaam && (
                      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                        Gekoppeld: {b.tenantNaam}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <p>{b.contactnaam}</p>
                    <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                      {b.email}
                      <br />
                      {b.telefoon}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">{naamVan.get(partnerId) ?? "(geen partner meer)"}</td>
                  <td className="px-4 py-2.5">
                    {MODEL_KORT[b.model]}
                    {b.model === "B" && u.status === "actief" && u.verdiendCents === 0 && (
                      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                        {uren(u.betaaldeMinuten)} van {MODEL_B.naBetaaldeUren} betaalde uren
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {STATUS_LABEL[u.status]}
                    {b.afwijsReden && (
                      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                        {b.afwijsReden}
                      </p>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-right">{uren(u.minuten)}</td>
                  <td className="num px-4 py-2.5 text-right">{euro(u.verdiendCents)}</td>
                  <td className="px-4 py-2.5">
                    <RegistratieActies partnerId={partnerId} bedrijfId={b.id} status={u.status} kvk={b.kvk} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );

  const exportTab = (
    <Panel title="Maandoverzicht per partner" subtitle="Een CSV (opent in Excel) met per bedrijf de uren en de commissie. Uitbetaalbaar is de commissie over uren waarvan de klant de factuur al betaalde: daarover stuurt de partner zijn zzp-factuur.">
      {partners.length === 0 ? (
        <Empty title="Nog geen sales partners" />
      ) : (
        <form method="get" action="/api/admin/sales-partners/export" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="exp-partner" className="block text-xs font-medium" style={{ color: "var(--a-mute)" }}>
              Partner
            </label>
            <select id="exp-partner" name="partner" className="a-input w-auto">
              {partners.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.naam}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="exp-maand" className="block text-xs font-medium" style={{ color: "var(--a-mute)" }}>
              Maand
            </label>
            <select id="exp-maand" name="maand" className="a-input w-auto">
              {laatsteMaanden(new Date()).map((m) => (
                <option key={m} value={m}>
                  {maandLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <button className="a-btn a-btn-primary">Download CSV</button>
        </form>
      )}
    </Panel>
  );

  return (
    <div className="space-y-4">
      <PageHead
        title="Sales partners"
        subtitle="Recruiters op commissie: Model A € 1,00 per gewerkt uur (eerste 6 maanden) of Model B € 100 eenmalig na 40 betaalde uren. Bedragen excl. btw."
      />
      <KpiStrip
        items={[
          { label: "Partners", value: partners.length },
          { label: "Te beoordelen", value: teBeoordelen, tone: teBeoordelen > 0 ? "warn" : "neutral" },
          { label: "Commissie verdiend", value: euro(totaal.verdiend), tone: "money" },
          { label: "Uitbetaalbaar", value: euro(totaal.uitbetaalbaar), tone: "money" },
        ]}
      />
      <Tabs
        label="Sales partners"
        tabs={[
          { id: "partners", label: "Partners", content: partnerTab },
          { id: "bedrijfsleads", label: "Bedrijfsleads", badge: teBeoordelen || null, content: leadsTab },
          { id: "export", label: "Commissie exporteren", content: exportTab },
        ]}
      />
    </div>
  );
}
