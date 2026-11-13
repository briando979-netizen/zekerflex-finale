import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { KpiStrip, Notice, PageHead, Panel } from "@/components/admin/kit";
import { WERKER_LIMIET, werkerTrechterGecached } from "@/lib/admin/werker-trechter";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { WERKER_VENSTERS, codeTelling, stilBij, werkerTrechter } from "@/lib/admin/werker-trechter-kern";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Werkerstrechter (13 nov 2026): hoe ver komen nieuwe echte werkers door de vijf stappen van de
// poort, en wat doen ze op de schermen van de ID-ombouw? Zo ziet de eigenaar zelf of de ombouw helpt. Alleen aantallen.

export default async function WerkerTrechterPage(props: { searchParams: Promise<{ vernieuw?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De werkerstrechter is alleen voor platformbeheerders." />;
  }
  const { vernieuw } = await props.searchParams;
  // hooguit 10 minuten oud (cache in het geheugen); de vensters rekenen vanaf het moment van ophalen
  const data = await werkerTrechterGecached(new Date(), vernieuw === "1");
  const nu = data.bijgewerkt;
  const tellingen = WERKER_VENSTERS.map((v) => ({ venster: v, t: werkerTrechter(data.werkers, nu, v) }));
  const t = (v: number) => tellingen.find((x) => x.venster === v)?.t;
  const t7 = t(7);
  const t30 = t(30);
  const stil = stilBij(data.werkers, nu, 30);
  const codes7 = codeTelling(data.codes, nu, 7);
  const codes30 = codeTelling(data.codes, nu, 30);
  const stapAantal = (v: number, sleutel: string) => t(v)?.perStap.find((s) => s.sleutel === sleutel)?.aantal ?? 0;

  const cel = { padding: "8px 10px", borderBottom: "1px solid var(--a-border)", fontSize: "0.8125rem" };
  const kop = { ...cel, textAlign: "left" as const, fontWeight: 600, color: "var(--a-mute)", whiteSpace: "nowrap" as const };
  const getal = { ...cel, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };

  return (
    <div className="space-y-4">
      <PageHead
        title="Werkerstrechter"
        subtitle="Hoe ver komen nieuwe echte werkers door de vijf stappen, en wat doen ze op de schermen van de ID-check? Alleen aantallen."
        meta={<span>Bijgewerkt om {amsterdamClock(nu)}</span>}
        actions={
          // geen prefetch: dat zou alle poortstanden voor niets opnieuw ophalen
          <Link href="/admin/werker-trechter?vernieuw=1" prefetch={false} className="a-btn text-xs">
            Vernieuwen
          </Link>
        }
      />
      <KpiStrip
        items={[
          { label: "Nieuwe werkers", value: String(t7?.nieuw ?? 0), hint: `7 dagen · ${t30?.nieuw ?? 0} in 30 dagen`, tone: (t7?.nieuw ?? 0) > 0 ? "ok" : "warn" },
          { label: "Gegevens ingevuld", value: String(stapAantal(30, "gegevens")), hint: `van ${t30?.nieuw ?? 0} in 30 dagen (stap 3)` },
          { label: "ID ingestuurd", value: String(stapAantal(30, "identiteit")), hint: "30 dagen (stap 4)", tone: "trust" },
          { label: "Klaar, mag reageren", value: String(t30?.klaar ?? 0), hint: "alle vijf stappen, 30 dagen", tone: (t30?.klaar ?? 0) > 0 ? "ok" : "warn" },
          { label: "Indienen na controle", value: String(codes7.find((c) => c.code === "id-controle-indienen")?.sessies ?? 0), hint: "sessies in 7 dagen" },
        ]}
      />
      <Notice tone="plan">
        Echte werkers: geen testadres, geen eigen domein, geen beheer of sales, geen tijdelijk testaccount. Een venster telt de werkers die in
        die periode zijn aangemeld, en per stap hoeveel van hen hem al haalden. De stappen komen uit dezelfde poortfunctie als de app, dus ook
        stap 3 (gegevens) is exact. Sessies die beheer of de studio bezochten (controles) tellen nergens mee.
        {data.afgekapt ? ` Er waren meer dan ${WERKER_LIMIET} nieuwe werkers in 30 dagen; alleen de nieuwste ${WERKER_LIMIET} zijn geteld.` : ""}
      </Notice>

      <Panel title="Werkers per stap" subtitle="Aangemeld in de periode, en hoeveel daarvan elke stap haalden">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
            <thead>
              <tr>
                <th style={kop}>Stap</th>
                {WERKER_VENSTERS.map((v) => (
                  <th key={v} style={{ ...kop, textAlign: "right" }}>{v} dagen</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cel}>Aangemeld</td>
                {WERKER_VENSTERS.map((v) => (
                  <td key={v} style={getal}>{t(v)?.nieuw ?? 0}</td>
                ))}
              </tr>
              {(t30?.perStap ?? []).map((s) => (
                <tr key={s.sleutel}>
                  <td style={cel}>{s.naam}</td>
                  {WERKER_VENSTERS.map((v) => (
                    <td key={v} style={getal}>{stapAantal(v, s.sleutel)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td style={{ ...cel, fontWeight: 600 }}>Klaar (mag reageren)</td>
                {WERKER_VENSTERS.map((v) => (
                  <td key={v} style={{ ...getal, fontWeight: 600 }}>{t(v)?.klaar ?? 0}</td>
                ))}
              </tr>
              <tr>
                <td style={cel}>Op Verificatie geweest</td>
                {WERKER_VENSTERS.map((v) => (
                  <td key={v} style={getal}>{t(v)?.zagVerificatie ?? 0}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {(t30?.onbekend ?? 0) > 0 && (
          <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
            Bij {t30?.onbekend} werker(s) konden de stappen niet worden opgehaald; die tellen wel als aangemeld.
          </p>
        )}
      </Panel>

      <Panel title="Waar ze nu stilstaan" subtitle={`Aangemeld in 30 dagen: de eerste stap die nog open staat (de teller “Stap n van 5”)`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 320 }}>
            <tbody>
              {stil.map((s) => (
                <tr key={s.sleutel}>
                  <td style={cel}>{s.naam}</td>
                  <td style={getal}>{s.aantal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Meetcodes van de ID-check en de gegevens" subtitle="Klikken en velden met een vaste code; aantal keer en unieke sessies">
        {codes30.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen meetcodes in de laatste 30 dagen.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={kop}>Code</th>
                  <th style={{ ...kop, textAlign: "right" }}>Keer 7 d</th>
                  <th style={{ ...kop, textAlign: "right" }}>Sessies 7 d</th>
                  <th style={{ ...kop, textAlign: "right" }}>Keer 30 d</th>
                  <th style={{ ...kop, textAlign: "right" }}>Sessies 30 d</th>
                </tr>
              </thead>
              <tbody>
                {codes30.map((c) => {
                  const c7 = codes7.find((x) => x.code === c.code);
                  return (
                    <tr key={c.code}>
                      <td style={{ ...cel, fontFamily: "var(--a-mono, monospace)" }}>{c.code}</td>
                      <td style={getal}>{c7?.keer ?? 0}</td>
                      <td style={getal}>{c7?.sessies ?? 0}</td>
                      <td style={getal}>{c.keer}</td>
                      <td style={getal}>{c.sessies}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Soort ID per maand" subtitle="Eigen ID-scans met een geldige code: Nederlands model 2021+ (BSN alleen in een QR-code) of overig">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
            <thead>
              <tr>
                <th style={kop}>Maand</th>
                <th style={{ ...kop, textAlign: "right" }}>NL paspoort 2021+</th>
                <th style={{ ...kop, textAlign: "right" }}>NL ID-kaart 2021+</th>
                <th style={{ ...kop, textAlign: "right" }}>Overig</th>
              </tr>
            </thead>
            <tbody>
              {data.idSoort.map((m) => (
                <tr key={m.maand}>
                  <td style={cel}>{m.maand}</td>
                  <td style={getal}>{m.telling?.nld_paspoort_2021 ?? 0}</td>
                  <td style={getal}>{m.telling?.nld_idkaart_2021 ?? 0}</td>
                  <td style={getal}>{m.telling?.overig ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
