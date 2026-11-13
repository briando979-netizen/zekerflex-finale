import { getPrincipal, hasRole } from "@/lib/auth";
import { KpiStrip, Notice, PageHead, Panel } from "@/components/admin/kit";
import { werkgeverTrechterData } from "@/lib/admin/werkgever-trechter";
import { leesKlusVia } from "@/lib/klusconcept/via-opslag";
import { BEDRIJF_STAPPEN, VENSTERS, bedrijfTrechter, bezoekPerPagina, type Venster } from "@/lib/admin/werkgever-trechter-kern";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Werkgeverstrechter (12 nov): hoe ver komen echte bedrijven, en hoeveel bezoekers zien de
// werkgeverspagina's en klikken op de hoofdknop? Alleen aantallen. Het aanbod (bedrijven met klussen) is de rem op het
// platform; deze pagina laat zien waar het stokt.
const VENSTER_NAAM = (v: Venster) => (v === null ? "Alles" : `${v} dagen`);

export default async function WerkgeverTrechterPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De werkgeverstrechter is alleen voor platformbeheerders." />;
  }
  const nu = new Date();
  const [{ bedrijven, bezoek }, via] = await Promise.all([werkgeverTrechterData(nu), leesKlusVia(nu)]);
  const trechters = VENSTERS.map((v) => ({ venster: v, stappen: bedrijfTrechter(bedrijven, nu, v) }));
  const bezoeken = ([7, 30] as const).map((v) => ({ venster: v, paginas: bezoekPerPagina(bezoek, nu, v) }));
  const stap = (v: Venster, key: string) => trechters.find((t) => t.venster === v)?.stappen.find((s) => s.key === key)?.aantal ?? 0;
  const som = (v: 7 | 30, veld: "sessies" | "klikken") => (bezoeken.find((b) => b.venster === v)?.paginas ?? []).reduce((n, p) => n + p[veld], 0);

  const cel = { padding: "8px 10px", borderBottom: "1px solid var(--a-border)", fontSize: "0.8125rem" };
  const kop = { ...cel, textAlign: "left" as const, fontWeight: 600, color: "var(--a-mute)", whiteSpace: "nowrap" as const };
  const getal = { ...cel, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };

  return (
    <div className="space-y-4">
      <PageHead
        title="Werkgeverstrechter"
        subtitle="Hoe ver komen echte bedrijven, en hoeveel bezoekers zien de werkgeverspagina's en klikken op de hoofdknop? Alleen aantallen."
      />
      <KpiStrip
        items={[
          { label: "Nieuwe bedrijven", value: String(stap(7, "aangemeld")), hint: `7 dagen · ${stap(30, "aangemeld")} in 30 dagen`, tone: stap(7, "aangemeld") > 0 ? "ok" : "warn" },
          { label: "Met een klus", value: String(stap(null, "klusGeplaatst")), hint: `van ${stap(null, "aangemeld")} echte bedrijven` },
          { label: "Met een toewijzing", value: String(stap(null, "toewijzing")), hint: "er werkte al iemand", tone: "plan" },
          { label: "Bezoek werkgeverspagina's", value: String(som(7, "sessies")), hint: `sessies in 7 dagen · ${som(30, "sessies")} in 30 dagen` },
          { label: "Klik op de hoofdknop", value: String(som(7, "klikken")), hint: `sessies in 7 dagen · ${som(30, "klikken")} in 30 dagen`, tone: som(7, "klikken") > 0 ? "ok" : "warn" },
        ]}
      />
      <Notice tone="neutral">
        Via de tip van een werker (/klus-plaatsen?via=werker), deze maand: {via.bezoek} keer geopend, {via.concept} keer een klus samengesteld. Alleen een totaal, geen persoon.
      </Notice>
      <Notice tone="plan">
        Echte bedrijven: geen platform, en minstens één lid dat geen testaccount is (geen testadres, geen eigen domein, geen beheer of sales, geen testbedrijfsnaam). Een venster telt de bedrijven die in die periode zijn aangemeld, en per stap hoeveel van hen hem al haalden. Geverifieerd volgt dezelfde regel als de poort voor klussen.
      </Notice>

      <Panel title="Bedrijven per stap" subtitle="Aangemeld in de periode, en hoeveel daarvan elke stap haalden">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
            <thead>
              <tr>
                <th style={kop}>Stap</th>
                {VENSTERS.map((v) => (
                  <th key={String(v)} style={{ ...kop, textAlign: "right" }}>{VENSTER_NAAM(v)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BEDRIJF_STAPPEN.map((s) => (
                <tr key={s.key}>
                  <td style={cel}>{s.label}</td>
                  {VENSTERS.map((v) => (
                    <td key={String(v)} style={getal}>{stap(v, s.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Bezoek en hoofdknop" subtitle="Unieke sessies van gasten (niet ingelogd) per pagina, en hoeveel daarvan op de hoofdknop klikten">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
            <thead>
              <tr>
                <th style={kop}>Pagina</th>
                <th style={{ ...kop, textAlign: "right" }}>Sessies 7 d</th>
                <th style={{ ...kop, textAlign: "right" }}>Klik 7 d</th>
                <th style={{ ...kop, textAlign: "right" }}>Sessies 30 d</th>
                <th style={{ ...kop, textAlign: "right" }}>Klik 30 d</th>
              </tr>
            </thead>
            <tbody>
              {(bezoeken[1]?.paginas ?? []).map((p30) => {
                const p7 = bezoeken[0]?.paginas.find((p) => p.pagina === p30.pagina);
                return (
                  <tr key={p30.pagina}>
                    <td style={cel}>{p30.pagina}</td>
                    <td style={getal}>{p7?.sessies ?? 0}</td>
                    <td style={getal}>{p7?.klikken ?? 0}</td>
                    <td style={getal}>{p30.sessies}</td>
                    <td style={getal}>{p30.klikken}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
          Hoofdknop: Organisatie aanmelden, (Gratis) klus plaatsen, Plaats of Zet deze klus klaar, Demo aanvragen of Vraag een demo aan.
        </p>
      </Panel>
    </div>
  );
}
