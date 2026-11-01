import { getPrincipal, hasRole } from "@/lib/auth";
import { listApplications } from "@/lib/jobs/store";
import { bucketCount, resolvePeriod, timelineKeys } from "@/lib/admin/period";
import { count } from "@/lib/admin/format";
import { BarList, KpiStrip, PageHead, Panel, PeriodTabs } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { ApplicationsBoard } from "@/components/admin/ApplicationsBoard";

export const dynamic = "force-dynamic";

export default async function SollicitatiesPage(props: { searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Open sollicitaties zijn alleen voor platformbeheerders." />;
  }
  const { periode } = await props.searchParams;
  const period = resolvePeriod(periode, 90);

  const apps = await listApplications(200);
  const inPeriod = apps.filter((a) => new Date(a.at) >= period.from);
  const withCv = apps.filter((a) => a.files.some((f) => f.kind === "cv")).length;
  const withMotivation = apps.filter((a) => a.motivationText?.trim() || a.files.some((f) => f.kind === "motivatiebrief")).length;

  const interests = new Map<string, number>();
  for (const a of apps) for (const s of a.skills) interests.set(s, (interests.get(s) ?? 0) + 1);
  const topInterests = [...interests.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-4">
      <PageHead
        title="Sollicitaties"
        subtitle="Iedereen die via /over-ons een open sollicitatie heeft ingestuurd, met motivatie en cv."
        actions={<PeriodTabs period={period} basePath="/admin/sollicitaties" />}
      />

      <KpiStrip
        items={[
          { label: "In deze periode", value: count(inPeriod.length), hint: `laatste ${period.label}`, spark: bucketCount(apps, (a) => new Date(a.at), period) },
          { label: "Totaal", value: count(apps.length), hint: "alle sollicitaties" },
          { label: "Met cv", value: count(withCv), hint: "kun je meteen bekijken" },
          { label: "Met motivatie", value: count(withMotivation), hint: "tekst of brief" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Binnengekomen" subtitle={`Laatste ${period.label}`}>
          <Chart title="Sollicitaties per periode" kind="bars" unit="count" labels={timelineKeys(period)} series={[{ label: "Sollicitaties", values: bucketCount(apps, (a) => new Date(a.at), period) }]} height={170} emptyText="Nog geen sollicitaties in deze periode." />
        </Panel>
        <Panel title="Waar mensen interesse in hebben">
          <BarList emptyText="Nog geen interesses opgegeven." rows={topInterests.map(([label, value]) => ({ key: label, label, value, display: count(value) }))} />
        </Panel>
      </div>

      <ApplicationsBoard applications={apps} />
    </div>
  );
}
