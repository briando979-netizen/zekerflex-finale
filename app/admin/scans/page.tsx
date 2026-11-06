import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Funnel, KpiStrip, PageHead, Panel } from "@/components/admin/kit";
import { ScansTabel, type ScanRij } from "@/components/admin/ScansTabel";
import { lijstScans } from "@/lib/scans/store";
import { dealVerlopen, getDeals } from "@/lib/scans/deal";
import { dealEuro, dealTotaal, laatstOpgevolgd, statusVan, trechter } from "@/lib/scans/model";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Scans & deals: elke gratis website-check en review-scan, wat de
// bezoeker daarna deed (lib/scans), de automatische lead en het voorstel op maat.
export default async function ScansPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Scans & deals zijn alleen beschikbaar voor platformbeheerders." />;
  }
  const scans = await lijstScans(1000);
  const deals = await getDeals(scans.map((s) => s.dealId).filter((d): d is string => Boolean(d)));
  const leadIds = [...new Set(scans.map((s) => s.leadId).filter((l): l is string => Boolean(l)))];
  const leads = leadIds.length
    ? await prisma.salesLead
        .findMany({ where: { id: { in: leadIds } }, select: { id: true, status: true, contactName: true, source: true, contactEmail: true, discoveredEmail: true } })
        .catch(() => [] as { id: string; status: string; contactName: string | null; source: string; contactEmail: string | null; discoveredEmail: string | null }[])
    : [];
  const leadVan = new Map(leads.map((l) => [l.id, l]));

  const nu = Date.now();
  const recent = scans.filter((s) => nu - Date.parse(s.at) <= 30 * 86_400_000);
  const t = trechter(recent);
  const akkoordWaarde = [...deals.values()].filter((d) => d.status === "akkoord").reduce((som, d) => {
    const x = dealTotaal(d.opties, d.keuze);
    return { eenmalig: som.eenmalig + x.eenmaligCent, maand: som.maand + x.maandCent };
  }, { eenmalig: 0, maand: 0 });
  const pct = (n: number) => (t.gescand ? `${Math.round((n / t.gescand) * 100)}%` : "–");

  const rijen: ScanRij[] = scans.map((s) => {
    const d = s.dealId ? deals.get(s.dealId) : undefined;
    const lead = s.leadId ? leadVan.get(s.leadId) : undefined;
    const totaal = d ? dealTotaal(d.opties, d.keuze) : null;
    return {
      sleutel: s.sleutel,
      soort: s.soort,
      at: s.at,
      naam: s.naam,
      host: s.host,
      plaats: s.plaats,
      score: s.score,
      samenvatting: s.samenvatting,
      rapport: s.rapport,
      status: statusVan(s),
      stappen: (s.stappen ?? []).map((x) => ({ stap: x.stap, at: x.at, info: x.info ?? null })),
      siteSlug: s.siteSlug,
      lead: lead ? { status: lead.status, contact: lead.contactName, bron: lead.source } : s.leadId ? { status: "?", contact: null, bron: "" } : null,
      deal: d
        ? {
            id: d.id,
            status: d.status,
            gekozen: (d.opties ?? []).filter((o) => (d.keuze ?? []).includes(o.id)).map((o) => o.naam),
            eenmalig: totaal?.eenmaligCent ?? 0,
            maand: totaal?.maandCent ?? 0,
            verlopen: dealVerlopen(d, nu),
          }
        : null,
      email: lead?.contactEmail ?? lead?.discoveredEmail ?? null,
      opgevolgd: laatstOpgevolgd(s),
    };
  });

  return (
    <div className="space-y-5">
      <PageHead
        title="Scans & deals"
        subtitle="Elke gratis website-check en review-scan: wat de scan vond, wat de bezoeker daarna deed, de automatische lead en het voorstel op maat."
      />
      <KpiStrip
        items={[
          { label: "Scans (30 dagen)", value: String(t.gescand) },
          { label: "Keken verder", value: pct(t.verder), hint: `${t.verder} scans`, tone: "plan" },
          { label: "Vroegen contact aan", value: String(t.aanvraag), tone: t.aanvraag ? "warn" : "neutral" },
          { label: "Akkoord met voorstel", value: String(t.akkoord), tone: t.akkoord ? "ok" : "neutral" },
          { label: "Waarde akkoord (totaal)", value: dealEuro(akkoordWaarde.eenmalig), hint: `+ ${dealEuro(akkoordWaarde.maand)} per maand`, tone: "money" },
          { label: "Automatische leads", value: String(leadIds.length), href: "/admin/sales" },
        ]}
      />
      <Panel title="Van scan tot akkoord" subtitle="De laatste 30 dagen; een latere stap telt ook voor de eerdere.">
        <Funnel
          stages={[
            { label: "Gescand", value: t.gescand },
            { label: "Keken verder (nieuwe site, stijl of voorstel)", value: t.verder },
            { label: "Vroegen contact aan", value: t.aanvraag },
            { label: "Akkoord met voorstel", value: t.akkoord },
          ]}
        />
      </Panel>
      <Panel
        title="Alle scans"
        subtitle="Nieuwste eerst. Een lead zonder contactpersoon is automatisch gemaakt: de bezoeker vroeg (nog) niets aan. Met Stuur voorstel mail je het voorstel op maat zelf naar het bedrijf (zakelijke introductie met afmeldlink, hooguit eens per week)."
        flush
      >
        <ScansTabel rijen={rijen} />
      </Panel>
    </div>
  );
}
