import Link from "next/link";
import type { AuditCategory } from "@prisma/client";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditActors } from "@/lib/audit";
import { bucketCount, resolvePeriod, safe, timelineKeys } from "@/lib/admin/period";
import { count, dateTimeNl } from "@/lib/admin/format";
import { BarList, KpiStrip, PageHead, Panel, PeriodTabs, Pill, type Tone } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";

export const dynamic = "force-dynamic";

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  info: { label: "Info", tone: "neutral" },
  warning: { label: "Let op", tone: "warn" },
  critical: { label: "Kritiek", tone: "crit" },
};

// "Folders" the admin can click through — each maps to one or more of the
// underlying AuditCategory values so related events sit together.
const FOLDERS: { key: string; label: string; categories: AuditCategory[] }[] = [
  { key: "", label: "Alles", categories: [] },
  { key: "gebruikers", label: "Gebruikers", categories: ["AUTH", "KYC"] },
  { key: "bedrijven", label: "Bedrijven", categories: ["COMPANY", "AGREEMENT"] },
  { key: "security", label: "Security & logins", categories: ["SECURITY"] },
  { key: "facturatie", label: "Facturatie & uren", categories: ["BILLING", "TIMESHEET"] },
  { key: "disputen", label: "Disputen", categories: ["DISPUTE"] },
  { key: "matching", label: "Matching", categories: ["MATCHING"] },
  { key: "beheer", label: "Beheer & sales", categories: ["ADMIN", "SALES", "ORCHESTRATION"] },
];

export default async function AuditPage(props: { searchParams: Promise<{ folder?: string; q?: string; periode?: string }> }) {
  const searchParams = await props.searchParams;
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het auditspoor is alleen voor platformbeheerders." />;
  }

  const folder = FOLDERS.find((f) => f.key === (searchParams.folder ?? "")) ?? FOLDERS[0]!;
  // ?q=a&q=b komt als array binnen: alleen de eerste waarde telt
  const qRuw = searchParams.q;
  const q = (Array.isArray(qRuw) ? qRuw[0] : qRuw)?.trim() ?? "";
  const period = resolvePeriod(searchParams.periode);
  const where = {
    ...(folder.categories.length ? { category: { in: folder.categories } } : {}),
    ...(q ? { summary: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [entries, inPeriod, byCategory] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        category: true,
        action: true,
        severity: true,
        summary: true,
        actorUserId: true,
        actorLabel: true,
        targetType: true,
        targetId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    safe(() => prisma.auditLog.findMany({ where: { ...where, createdAt: { gte: period.from } }, select: { createdAt: true, severity: true }, take: 50_000 }), []),
    safe(() => prisma.auditLog.groupBy({ by: ["category"], where: { ...where, createdAt: { gte: period.from } }, _count: { _all: true } }), []),
  ]);

  const severityCount = (s: string) => inPeriod.filter((e) => e.severity === s).length;
  const extra: Record<string, string> = { ...(folder.key ? { folder: folder.key } : {}), ...(q ? { q } : {}) };
  const actor = await auditActors(entries);

  const rows: TableRow[] = entries.map((e) => {
    const sev = SEVERITY[e.severity] ?? { label: e.severity, tone: "neutral" as const };
    const who = actor(e).name;
    return {
      id: e.id,
      search: `${e.summary} ${e.action} ${who}`,
      filters: { severity: e.severity },
      cells: {
        when: <span className="whitespace-nowrap">{dateTimeNl(e.createdAt)}</span>,
        what: (
          <span className="block min-w-[16rem]">
            <span className="block" style={{ color: "var(--a-text)" }}>{e.summary}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--a-mute)" }}>
              <span className="font-mono">{e.action}</span>
              {e.targetType === "user" && e.targetId && <Link href={`/admin/gebruikers/${e.targetId}`} className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Gebruiker →</Link>}
              {e.targetType === "tenant" && e.targetId && <Link href={`/admin/bedrijven/${e.targetId}`} className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Organisatie →</Link>}
            </span>
          </span>
        ),
        who: who,
        category: <Pill dot={false}>{e.category}</Pill>,
        severity: <Pill tone={sev.tone}>{sev.label}</Pill>,
      },
      sort: { when: e.createdAt.getTime(), who, category: e.category, severity: e.severity },
      csv: { when: e.createdAt.toISOString(), what: e.summary, who, category: e.category, severity: sev.label },
    };
  });

  return (
    <div className="space-y-4">
      <PageHead
        title="Auditspoor"
        subtitle="Onwisbaar logboek van elke gevoelige handeling op het platform, per map te doorzoeken."
        actions={<PeriodTabs period={period} basePath="/admin/audit" extra={extra} />}
      />

      <nav aria-label="Mappen" className="a-scroll-x flex gap-1 overflow-x-auto">
        {FOLDERS.map((f) => {
          const on = folder.key === f.key;
          const params = new URLSearchParams({ ...(f.key ? { folder: f.key } : {}), ...(q ? { q } : {}), periode: String(period.days) }).toString();
          return (
            <Link
              key={f.key}
              href={`/admin/audit?${params}`}
              aria-current={on ? "true" : undefined}
              className="whitespace-nowrap rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-colors"
              style={on ? { background: "var(--a-elev)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      <KpiStrip
        items={[
          { label: "Gebeurtenissen", value: count(inPeriod.length), hint: `laatste ${period.label}`, spark: bucketCount(inPeriod, (e) => e.createdAt, period) },
          { label: "Kritiek", value: count(severityCount("critical")), hint: "vraagt aandacht", ...(severityCount("critical") > 0 ? { tone: "crit" as const } : {}) },
          { label: "Let op", value: count(severityCount("warning")), ...(severityCount("warning") > 0 ? { tone: "warn" as const } : {}) },
          { label: "Info", value: count(severityCount("info")) },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Gebeurtenissen per periode" subtitle={folder.label}>
          <Chart
            title="Gebeurtenissen in het auditspoor per periode, naar ernst"
            kind="bars"
            unit="count"
            labels={timelineKeys(period)}
            series={[
              { label: "Info", values: bucketCount(inPeriod.filter((e) => e.severity === "info"), (e) => e.createdAt, period), slot: 3 },
              { label: "Let op", values: bucketCount(inPeriod.filter((e) => e.severity === "warning"), (e) => e.createdAt, period), slot: 4 },
              { label: "Kritiek", values: bucketCount(inPeriod.filter((e) => e.severity === "critical"), (e) => e.createdAt, period), slot: 8 },
            ]}
            height={190}
            emptyText="Geen gebeurtenissen in deze periode."
          />
        </Panel>
        <Panel title="Per categorie" subtitle={`Laatste ${period.label}`}>
          <BarList emptyText="Geen gebeurtenissen." rows={byCategory.sort((a, b) => b._count._all - a._count._all).map((c) => ({ key: c.category, label: c.category, value: c._count._all, display: count(c._count._all) }))} />
        </Panel>
      </div>

      <Panel
        flush
        title={`${count(entries.length)} ${entries.length === 1 ? "gebeurtenis" : "gebeurtenissen"} in ${folder.label.toLowerCase()}`}
        subtitle={q ? `Gezocht op “${q}”` : "De nieuwste 500"}
        actions={
          <form className="flex gap-2">
            {folder.key && <input type="hidden" name="folder" value={folder.key} />}
            <input type="hidden" name="periode" value={period.days} />
            <input type="search" name="q" defaultValue={q} placeholder="Zoek in het hele logboek" aria-label="Zoek in het hele logboek" className="a-input !w-56 !py-1 text-[0.8125rem]" />
            <button type="submit" className="a-button text-xs">Zoeken</button>
          </form>
        }
      >
        <DataTable
          columns={[
            { key: "when", label: "Moment" },
            { key: "what", label: "Wat er gebeurde", sortable: false },
            { key: "who", label: "Door", hideOnMobile: true },
            { key: "category", label: "Map", hideOnMobile: true },
            { key: "severity", label: "Ernst" },
          ]}
          rows={rows}
          pageSize={25}
          searchPlaceholder="Filter deze lijst"
          csvName="auditspoor"
          filters={[{ key: "severity", label: "Ernst", chips: true, options: [{ value: "critical", label: "Kritiek" }, { value: "warning", label: "Let op" }, { value: "info", label: "Info" }] }]}
          defaultSort={{ key: "when", dir: "desc" }}
          emptyText="Niets gevonden. Pas de map of je zoekopdracht aan."
        />
      </Panel>
    </div>
  );
}
