import { getPrincipal, hasRole } from "@/lib/auth";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { BeoordeelKnoppen, VerkoperUitbetaalKnop } from "@/components/admin/VerkoperKnoppen";
import { alleVerkopers, teBeoordelen } from "@/lib/shop/verkoper";
import { VERKOOP_COMMISSIE_PCT, VERKOPER_UITBETALEN_VANAF_CENTS, VERKOPER_VAST_NA_DAGEN, verkoopTotalen } from "@/lib/shop/verkoper-core";

export const dynamic = "force-dynamic";

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const TH = "px-4 py-2.5 text-xs font-medium";

// Beheer → Webshop & merk → Verkopers: bedrijven die eigen producten verkopen in
// de ZekerFlex-shop. Elk product komt pas in de shop na goedkeuring hier; verkopen
// die vaststaan worden (nog) met de hand uitbetaald. Regels: lib/shop/verkoper-core.ts.
export default async function VerkopersAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Verkopers beheren is alleen voor platformbeheerders." />;
  }
  const [wachtend, verkopers] = await Promise.all([teBeoordelen().catch(() => null), alleVerkopers().catch(() => null)]);
  if (!wachtend || !verkopers) return <Notice tone="warn">Het verkopersoverzicht kon nu niet worden geladen. Probeer het straks opnieuw.</Notice>;

  const regels = verkopers
    .map((v) => ({ ...v, totaal: verkoopTotalen(v.rijen) }))
    .sort((a, b) => b.totaal.vastCents - a.totaal.vastCents || b.totaal.omzetCents - a.totaal.omzetCents);
  const som = verkoopTotalen(regels.flatMap((r) => r.rijen));

  return (
    <div className="space-y-4">
      <PageHead
        title="Verkopers"
        subtitle={`Geverifieerde bedrijven verkopen eigen producten in de shop. ZekerFlex houdt ${VERKOOP_COMMISSIE_PCT}% commissie in; een verkoop staat vast ${VERKOPER_VAST_NA_DAGEN} dagen na de bestelling, als hij verstuurd is.`}
      />
      <Notice tone="warn">
        Kopers betalen nu aan ZekerFlex en jij maakt het geld van verkopers zelf over. Zet Stripe Connect aan en laat de verkoopvoorwaarden nakijken voordat je de eerste producten goedkeurt (Te doen).
      </Notice>
      <KpiStrip
        items={[
          { label: "Wacht op goedkeuring", value: wachtend.length, tone: wachtend.length > 0 ? "warn" : "neutral" },
          { label: "Verkopers met verkopen", value: regels.length },
          { label: "Verkocht", value: euro(som.omzetCents), hint: `${som.bestellingen} verkopen` },
          { label: "Commissie", value: euro(som.commissieCents), tone: som.commissieCents > 0 ? "money" : "neutral" },
          { label: "Uit te betalen", value: euro(som.vastCents), tone: som.vastCents > 0 ? "money" : "neutral" },
        ]}
      />

      <Panel title="Wacht op goedkeuring" subtitle="Controleer foto, naam, tekst en prijs. Afgewezen producten krijgen je reden per mail." flush>
        {wachtend.length === 0 ? (
          <Empty title="Niets te beoordelen" body="Nieuwe producten van verkopers verschijnen hier; je krijgt er ook een melding van." />
        ) : (
          <ul>
            {wachtend.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-4 px-4 py-4" style={{ borderTop: "1px solid var(--a-border)" }}>
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg" style={{ background: "var(--a-elev)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.imageUrl && <img src={p.imageUrl} alt={`Foto van ${p.name}`} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium [overflow-wrap:anywhere]">{p.name}</p>
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                    {p.seller?.name ?? "Onbekende verkoper"}
                    {p.seller?.kvkNumber ? ` · KVK ${p.seller.kvkNumber}` : ""} · {p.category} · {euro(p.priceCents)} · voorraad {p.variants.reduce((s, v) => s + v.stock, 0)}
                    {p.variants.length > 1 ? ` (${p.variants.map((v) => v.size).join(", ")})` : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{p.description}</p>
                </div>
                <BeoordeelKnoppen productId={p.id} naam={p.name} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Uitbetalen per verkoper" subtitle={`Maak het bedrag over naar de rekening van de verkoper en klik daarna op Uitbetaald. Vanaf ${euro(VERKOPER_UITBETALEN_VANAF_CENTS)}.`} flush>
        {regels.length === 0 ? (
          <Empty title="Nog geen verkopen" body="Zodra iemand een product van een verkoper koopt, zie je het hier." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className={TH} style={{ color: "var(--a-mute)" }}>Verkoper</th>
                  <th scope="col" className={TH} style={{ color: "var(--a-mute)" }}>Rekening</th>
                  <th scope="col" className={`${TH} text-right`} style={{ color: "var(--a-mute)" }}>Te versturen</th>
                  <th scope="col" className={`${TH} text-right`} style={{ color: "var(--a-mute)" }}>Nog niet vast</th>
                  <th scope="col" className={`${TH} text-right`} style={{ color: "var(--a-mute)" }}>Uit te betalen</th>
                  <th scope="col" className={`${TH} text-right`} style={{ color: "var(--a-mute)" }}>Commissie</th>
                  <th scope="col" className={`${TH} text-right`} style={{ color: "var(--a-mute)" }}>
                    <span className="sr-only">Actie</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r) => (
                  <tr key={r.tenantId} className="align-top" style={{ borderTop: "1px solid var(--a-border)" }}>
                    <td className="px-4 py-3 font-medium">{r.bedrijf}</td>
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
                    <td className="px-4 py-3 text-right">{r.totaal.teVersturen > 0 ? <Pill tone="warn">{r.totaal.teVersturen}</Pill> : 0}</td>
                    <td className="px-4 py-3 text-right">{euro(r.totaal.lopendCents)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{euro(r.totaal.vastCents)}</td>
                    <td className="px-4 py-3 text-right">{euro(r.totaal.commissieCents)}</td>
                    <td className="px-4 py-3 text-right">
                      {r.totaal.vastCents >= VERKOPER_UITBETALEN_VANAF_CENTS && r.rekening ? <VerkoperUitbetaalKnop tenantId={r.tenantId} bedrag={euro(r.totaal.vastCents)} /> : null}
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
