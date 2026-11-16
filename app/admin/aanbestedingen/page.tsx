import { getPrincipal, hasRole } from "@/lib/auth";
import { KpiStrip, Notice, PageHead, Panel } from "@/components/admin/kit";
import { DataTable } from "@/components/admin/kit-client";
import { dagenTot, TENDER_GROEPEN } from "@/lib/integrations/tenderned";
import { tendernedKansen } from "@/lib/integrations/tenderned-server";

export const dynamic = "force-dynamic";

// Beheer → Sales & groei → Aanbestedingen (16 nov 2026): open overheidsopdrachten voor personeel, schoonmaak en catering
// van TenderNed (lib/integrations/tenderned*.ts), om op in te schrijven of door te geven aan een klant. Alleen lezen.

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** "2027-01-04T13:00" (al Nederlandse tijd) → "4 jan 2027, 13:00" */
const sluitTekst = (s: string) => `${Number(s.slice(8, 10))} ${MAANDEN[Number(s.slice(5, 7)) - 1] ?? ""} ${s.slice(0, 4)}, ${s.slice(11, 16)}`;
const opgehaaldTekst = (ms: number) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

export default async function AanbestedingenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De aanbestedingen zijn alleen voor platformbeheerders." />;
  }
  const nu = Date.now();
  const k = await tendernedKansen(nu);
  const lijst = k?.lijst ?? [];
  const groepNaam = (id: string) => TENDER_GROEPEN.find((g) => g.id === id)?.naam ?? id;

  return (
    <div className="space-y-4">
      <PageHead
        title="Aanbestedingen"
        subtitle="Open overheidsopdrachten voor personeel, schoonmaak en catering, van TenderNed. Inschrijven doe je op TenderNed zelf."
      />
      {!k ? (
        <Notice tone="warn" role="alert">
          TenderNed is nu niet bereikbaar en er is nog geen eerdere lijst bewaard. Probeer het later opnieuw.
        </Notice>
      ) : k.oud ? (
        <Notice tone="warn">TenderNed antwoordde nu niet; dit is de lijst van {opgehaaldTekst(k.opgehaald)}.</Notice>
      ) : (
        <p className="text-xs" style={{ color: "var(--a-dim)" }}>
          Opgehaald {opgehaaldTekst(k.opgehaald)}; de lijst wordt hooguit elke zes uur ververst.
        </p>
      )}
      <KpiStrip
        items={[
          { label: "Open opdrachten", value: String(lijst.length), tone: lijst.length ? "plan" : "neutral" },
          ...TENDER_GROEPEN.map((g) => ({ label: g.naam, value: String(lijst.filter((a) => a.groep === g.id).length), tone: "neutral" as const })),
          { label: "Sluit binnen 7 dagen", value: String(lijst.filter((a) => dagenTot(a.sluit, nu) <= 7).length), tone: "warn" as const },
        ]}
      />
      <Panel title="Open opdrachten" subtitle="Wat het eerst sluit, staat bovenaan. Klik op een titel voor de stukken op TenderNed.">
        <DataTable
          columns={[
            { key: "titel", label: "Opdracht" },
            { key: "opdrachtgever", label: "Opdrachtgever", hideOnMobile: true },
            { key: "groep", label: "Soort", hideOnMobile: true },
            { key: "sluit", label: "Sluit", sortable: true },
          ]}
          rows={lijst.map((a) => ({
            id: a.id,
            cells: {
              titel: (
                <a href={a.link} target="_blank" rel="noopener noreferrer" className="font-semibold underline" title={a.omschrijving}>
                  {a.titel}
                  <span className="sr-only"> (opent TenderNed in een nieuw tabblad)</span>
                </a>
              ),
              opdrachtgever: a.opdrachtgever,
              groep: `${groepNaam(a.groep)}${a.europees ? " · Europees" : ""}`,
              sluit: `${sluitTekst(a.sluit)} (${dagenTot(a.sluit, nu)} d)`,
            },
            sort: { sluit: a.sluit },
            search: `${a.titel} ${a.opdrachtgever} ${a.omschrijving}`,
            filters: { groep: a.groep },
            csv: { opdracht: a.titel, opdrachtgever: a.opdrachtgever, soort: groepNaam(a.groep), sluit: a.sluit, link: a.link },
          }))}
          filters={[{ key: "groep", label: "Soort", options: TENDER_GROEPEN.map((g) => ({ value: g.id, label: g.naam })) }]}
          searchPlaceholder="Zoek op titel of opdrachtgever"
          csvName="aanbestedingen"
          emptyText="Er staan nu geen open opdrachten in deze groepen."
        />
      </Panel>
    </div>
  );
}
