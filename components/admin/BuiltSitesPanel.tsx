import { Empty, NameCell, Panel, Pill, type Tone } from "@/components/admin/kit";
import { DataTable, type TableColumn, type TableRow } from "@/components/admin/kit-client";
import type { BuiltSiteRow } from "@/lib/sites/admin-overview";

// Beheer → Website-beheer: de websites die bedrijven met de bouwer maakten
// (lib/sites/admin-overview.ts), met bezoekers en berichten van de laatste 30 dagen.

const BEHEER: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Actief", tone: "ok" },
  SUBMITTED: { label: "Ingediend: jij bent aan zet", tone: "warn" },
  ONBOARDING: { label: "Klant vult gegevens in", tone: "neutral" },
  PENDING_PAYMENT: { label: "Betaling open", tone: "neutral" },
  PAUSED: { label: "Gepauzeerd", tone: "neutral" },
  CANCELLED: { label: "Opgezegd", tone: "neutral" },
};

const COLUMNS: TableColumn[] = [
  { key: "bedrijf", label: "Website", sortable: true },
  { key: "status", label: "Status" },
  { key: "gepubliceerd", label: "Laatst gepubliceerd", sortable: true, hideOnMobile: true },
  { key: "weergaven", label: "Bekeken (30 d)", align: "right", sortable: true },
  { key: "binnenkomsten", label: "Bezoeken (30 d)", align: "right", sortable: true, hideOnMobile: true },
  { key: "berichten", label: "Berichten (30 d)", align: "right", sortable: true, hideOnMobile: true },
  { key: "beheer", label: "Website-beheer", hideOnMobile: true },
];

const nf = new Intl.NumberFormat("nl-NL");
const day = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
const count = (n: number | null) => (n === null ? "–" : nf.format(n));

export function BuiltSitesPanel({ sites }: { sites: BuiltSiteRow[] }) {
  const rows: TableRow[] = sites.map((s) => {
    const beheer = s.beheer ? (BEHEER[s.beheer] ?? { label: s.beheer, tone: "neutral" as const }) : { label: "Geen abonnement", tone: "neutral" as const };
    const host = s.adres.replace(/^https?:\/\//, "");
    return {
      id: s.id,
      cells: {
        bedrijf: (
          <NameCell
            name={s.bedrijf}
            sub={
              <a href={s.adres} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {host}
                {s.eigenDomein ? " · eigen domein" : ""}
              </a>
            }
          />
        ),
        status: s.online ? <Pill tone="ok">Online</Pill> : <Pill>Concept</Pill>,
        gepubliceerd: s.gepubliceerd ? day(s.gepubliceerd) : "nog nooit",
        weergaven: count(s.weergaven),
        binnenkomsten: count(s.binnenkomsten),
        berichten: nf.format(s.berichten),
        beheer: <Pill tone={beheer.tone}>{beheer.label}</Pill>,
      },
      sort: { bedrijf: s.bedrijf, gepubliceerd: s.gepubliceerd, weergaven: s.weergaven, binnenkomsten: s.binnenkomsten, berichten: s.berichten },
      search: `${s.bedrijf} ${host}`,
      csv: { bedrijf: s.bedrijf, adres: s.adres, status: s.online ? "online" : "concept", gepubliceerd: s.gepubliceerd, weergaven: s.weergaven, binnenkomsten: s.binnenkomsten, berichten: s.berichten, beheer: beheer.label },
    };
  });
  return (
    <Panel
      title="Gebouwde websites"
      subtitle="Websites die bedrijven met de bouwer maakten, zonder de voorbeeldsite en de websitevoorstellen. Bezoekers en berichten over de laatste 30 dagen; bezoekers worden zonder cookies geteld."
      flush
    >
      {rows.length === 0 ? (
        <Empty title="Nog geen gebouwde websites" body="Zodra een bedrijf in Website → Bouwen een website maakt, staat hij hier." />
      ) : (
        <DataTable columns={COLUMNS} rows={rows} searchPlaceholder="Zoek op bedrijf of adres" csvName="gebouwde-websites" defaultSort={{ key: "weergaven", dir: "desc" }} />
      )}
    </Panel>
  );
}
