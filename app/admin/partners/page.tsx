import { getPrincipal, hasRole } from "@/lib/auth";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { PartnerUitbetaalKnop } from "@/components/admin/PartnerUitbetaalKnop";
import { allePartners } from "@/lib/shop/partner";
import { PARTNER_PCT, PARTNER_UITBETALEN_VANAF_CENTS, PARTNER_VAST_NA_DAGEN, partnerTotalen } from "@/lib/shop/partner-core";

export const dynamic = "force-dynamic";

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

// Beheer → Webshop & merk → Partnerprogramma: welke bedrijven via hun partnerlinks
// bestellingen brachten, wat vaststaat en wat er uitbetaald moet worden. Uitbetalen
// gaat (nog) met de hand: overmaken en dan op "Uitbetaald" klikken.
export default async function PartnersAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het partnerprogramma is alleen voor platformbeheerders." />;
  }
  const partners = await allePartners().catch(() => null);
  if (!partners) return <Notice tone="warn">Het partneroverzicht kon nu niet worden geladen. Probeer het straks opnieuw.</Notice>;

  const regels = partners
    .map((p) => ({ ...p, totaal: partnerTotalen(p.rijen) }))
    .sort((a, b) => b.totaal.vastCents - a.totaal.vastCents || b.totaal.omzetCents - a.totaal.omzetCents);
  const som = partnerTotalen(regels.flatMap((r) => r.rijen));
  const teBetalen = regels.filter((r) => r.totaal.vastCents >= PARTNER_UITBETALEN_VANAF_CENTS);

  return (
    <div className="space-y-4">
      <PageHead
        title="Partnerprogramma"
        subtitle={`Bedrijven delen links naar de webshop en krijgen ${PARTNER_PCT}% van het productbedrag zonder btw. Een vergoeding staat vast na ${PARTNER_VAST_NA_DAGEN} dagen; uitbetalen vanaf ${euro(PARTNER_UITBETALEN_VANAF_CENTS)}.`}
      />
      <KpiStrip
        items={[
          { label: "Partners met bestellingen", value: regels.length },
          { label: "Bestellingen", value: som.bestellingen, hint: euro(som.omzetCents) },
          { label: "In bedenktijd", value: euro(som.verdiendCents) },
          { label: "Uit te betalen", value: euro(som.vastCents), tone: som.vastCents > 0 ? "money" : "neutral", hint: `${teBetalen.length} boven het minimum` },
          { label: "Uitbetaald", value: euro(som.uitbetaaldCents) },
        ]}
      />
      <Panel title="Per bedrijf" subtitle="Maak het bedrag over naar de rekening van de partner en klik daarna op Uitbetaald." flush>
        {regels.length === 0 ? (
          <Empty title="Nog geen partnerbestellingen" body="Bedrijven vinden hun links in de Websitestudio onder Verdienen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-xs font-medium" style={{ color: "var(--a-mute)" }}>Bedrijf</th>
                  <th scope="col" className="px-4 py-2.5 text-xs font-medium" style={{ color: "var(--a-mute)" }}>Rekening</th>
                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: "var(--a-mute)" }}>Bestellingen</th>
                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: "var(--a-mute)" }}>In bedenktijd</th>
                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: "var(--a-mute)" }}>Uit te betalen</th>
                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: "var(--a-mute)" }}>Uitbetaald</th>
                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: "var(--a-mute)" }}>
                    <span className="sr-only">Actie</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r) => (
                  <tr key={r.tenantId} className="align-top" style={{ borderTop: "1px solid var(--a-border)" }}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.bedrijf}</span>
                      {r.code && <span className="block font-mono text-xs" style={{ color: "var(--a-mute)" }}>{r.code}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.rekening ? (
                        <>
                          <span className="font-mono text-xs">{r.rekening.iban}</span>
                          <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{r.rekening.tenaamstelling}</span>
                        </>
                      ) : (
                        <Pill tone="warn">Nog geen rekening</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{r.totaal.bestellingen}</td>
                    <td className="px-4 py-3 text-right">{euro(r.totaal.verdiendCents)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{euro(r.totaal.vastCents)}</td>
                    <td className="px-4 py-3 text-right">{euro(r.totaal.uitbetaaldCents)}</td>
                    <td className="px-4 py-3 text-right">
                      {r.totaal.vastCents >= PARTNER_UITBETALEN_VANAF_CENTS && r.rekening ? <PartnerUitbetaalKnop tenantId={r.tenantId} bedrag={euro(r.totaal.vastCents)} /> : null}
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
}
