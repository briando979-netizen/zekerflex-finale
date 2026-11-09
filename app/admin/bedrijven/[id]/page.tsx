import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyActivity } from "@/lib/admin/insights/detail";
import { count, dateNl, dateTimeNl, euro, euroExact, percentOf } from "@/lib/admin/format";
import { Avatar, Empty, Feed, KpiStrip, Meter, NameCell, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";
import { CompanyActions } from "@/components/admin/CompanyActions";
import { tenantVerification } from "@/lib/company/verified";
import { getBuitenlandBewijs } from "@/lib/company/buitenland";
import { landNaam } from "@/lib/onboarding/buitenland";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  FREELANCER: "Freelancer",
  LOCAL_MANAGER: "Vestigingsmanager",
  HQ_ADMIN: "Bedrijfsbeheerder",
  DISPUTE_MANAGER: "Dispuutmanager",
  PLATFORM_ADMIN: "Platformbeheerder",
};

const VERIFIED_VIA: Record<string, string> = { platform: "platform", kvk: "KVK actief", admin: "handmatig goedgekeurd", history: "bestaande klant" };

const INVOICE_TYPE: Record<string, string> = { PLATFORM_FEE: "Platformfee", SELF_BILL_FREELANCER: "Dienst (zzp)", CANCELLATION_PENALTY: "Annuleringsvergoeding", UITZEND_FEE: "Uitzendkracht" };

const SHIFT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Concept", tone: "neutral" },
  OPEN: { label: "Open", tone: "plan" },
  MATCHING: { label: "Zoekt mensen", tone: "plan" },
  PARTIALLY_FILLED: { label: "Deels bezet", tone: "warn" },
  FILLED: { label: "Bezet", tone: "ok" },
  IN_PROGRESS: { label: "Bezig", tone: "plan" },
  COMPLETED: { label: "Afgerond", tone: "ok" },
  CANCELLED: { label: "Geannuleerd", tone: "neutral" },
};

export default async function BedrijfDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      branches: { select: { id: true, name: true, city: true } },
      memberships: { include: { user: { select: { id: true, fullName: true, email: true, disabledAt: true } } } },
    },
  });

  if (!tenant) {
    return (
      <div>
        <PageHead title="Organisatie niet gevonden" subtitle={params.id} />
        <Link href="/admin/bedrijven" className="text-sm font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>← Terug naar bedrijven</Link>
      </div>
    );
  }

  const [activity, auditEntries, verification, buitenland] = await Promise.all([
    companyActivity(tenant.id),
    prisma.auditLog.findMany({
      where: { OR: [{ targetType: "tenant", targetId: tenant.id }, { targetType: "user", targetId: { in: tenant.memberships.map((m) => m.userId) } }] },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, category: true, action: true, summary: true, severity: true, createdAt: true },
    }),
    tenantVerification(tenant.id),
    tenant.country !== "NL" ? getBuitenlandBewijs(tenant.id) : Promise.resolve(null),
  ]);

  const hqAdmin = tenant.memberships.find((m) => m.role === "HQ_ADMIN")?.user;
  const blocked = tenant.memberships.length > 0 && tenant.memberships.every((m) => m.user.disabledAt);

  const invoiceRows: TableRow[] = activity.invoices.map((inv) => ({
    id: inv.id,
    search: `${inv.number} ${INVOICE_TYPE[inv.type] ?? inv.type}`,
    filters: { status: inv.status },
    cells: {
      number: <span className="font-mono text-xs" style={{ color: "var(--a-text)" }}>{inv.number}</span>,
      type: INVOICE_TYPE[inv.type] ?? inv.type,
      date: dateNl(inv.createdAt),
      total: <span className="font-medium" style={{ color: "var(--a-text)" }}>{euroExact(inv.totalCents)}</span>,
      status: <Pill tone={inv.status === "PAID" ? "ok" : "warn"}>{inv.status === "PAID" ? "Betaald" : "Open"}</Pill>,
      pdf: <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" className="a-button text-xs">PDF</a>,
    },
    sort: { number: inv.number, type: INVOICE_TYPE[inv.type] ?? inv.type, date: inv.createdAt.getTime(), total: inv.totalCents, status: inv.status },
  }));

  const shiftRows: TableRow[] = activity.shifts.map((s) => {
    const status = SHIFT_STATUS[s.status] ?? { label: s.status, tone: "neutral" as const };
    return {
      id: s.id,
      search: `${s.title} ${s.branch.name}`,
      cells: {
        title: <span className="font-medium" style={{ color: "var(--a-text)" }}>{s.title}</span>,
        branch: s.branch.name,
        date: dateTimeNl(s.startsAt),
        filled: `${Math.min(s.assignments.length, s.positions)} van ${s.positions}`,
        status: <Pill tone={status.tone}>{status.label}</Pill>,
      },
      sort: { title: s.title, branch: s.branch.name, date: s.startsAt.getTime(), filled: s.assignments.length, status: status.label },
    };
  });

  return (
    <div className="space-y-4">
      <Link href="/admin/bedrijven" className="inline-block text-xs font-medium hover:underline" style={{ color: "var(--a-mute)" }}>← Alle bedrijven</Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={tenant.name} size={56} />
          <div className="min-w-0">
            <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight sm:text-[1.625rem]" style={{ color: "var(--a-text)" }}>{tenant.name}</h1>
            <p className="mt-0.5 text-sm" style={{ color: "var(--a-mute)" }}>
              {tenant.kvkNumber
                ? `KVK ${tenant.kvkNumber}`
                : tenant.country !== "NL"
                  ? `${landNaam(tenant.country)}${tenant.vatNumber ? `, btw ${tenant.vatNumber}` : ""}${buitenland?.registratieNummer ? `, registratienummer ${buitenland.registratieNummer}` : ""}${buitenland?.btw === "niet-bereikbaar" ? " (btw-nummer nog te controleren: VIES was niet bereikbaar)" : ""}`
                  : "Geen KVK-nummer"}, {tenant.branches.length} {tenant.branches.length === 1 ? "vestiging" : "vestigingen"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone={blocked ? "crit" : "ok"}>{blocked ? "Geblokkeerd" : "Actief"}</Pill>
              <Pill tone={verification.verified ? "trust" : "warn"}>
                {verification.verified
                  ? `Geverifieerd: ${VERIFIED_VIA[verification.via!] ?? verification.via}`
                  : verification.buitenlands
                    ? "Buitenlands bedrijf: zoek het zelf op en keur het zo nodig goed"
                    : verification.inControle
                    ? "KVK klopt: controleer of de aanmelder erbij hoort"
                    : "Niet geverifieerd, alleen testklus"}
              </Pill>
            </div>
          </div>
        </div>
        {hqAdmin && <CompanyActions tenantId={tenant.id} contactUserId={hqAdmin.id} blocked={blocked} verifiedVia={verification.via} />}
      </header>

      <KpiStrip
        items={[
          { label: "Totaal betaald", value: euro(activity.paidCents), hint: `${count(activity.paidCount)} facturen` },
          { label: "Staat open", value: euro(activity.openCents), hint: `${count(activity.openCount)} facturen`, ...(activity.openCents > 0 ? { tone: "money" as const } : {}) },
          { label: "Klussen", value: count(activity.shiftCount), hint: `${count(activity.positions)} plekken` },
          { label: "Gewerkte uren", value: count(Math.round(activity.hours)), hint: "goedgekeurd" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Gefactureerd per maand" subtitle="De laatste 12 maanden">
          <Chart
            title="Gefactureerd per maand, betaald en open"
            kind="bars"
            unit="money"
            labels={activity.labels}
            series={[
              { label: "Betaald", values: activity.paidSeries, slot: 1 },
              { label: "Open", values: activity.openSeries, slot: 4 },
            ]}
            height={210}
            emptyText="Nog geen facturen voor dit bedrijf."
          />
        </Panel>
        <div className="space-y-4">
          <Panel title="Bezetting" subtitle="Plekken die ooit zijn ingevuld">
            <Meter label="Ingevuld" value={activity.filled} max={activity.positions} display={`${count(activity.filled)} van ${count(activity.positions)}, ${percentOf(activity.filled, activity.positions)}%`} tone="ok" />
          </Panel>
          <Panel flush title="Vestigingen">
            {tenant.branches.length === 0 ? (
              <Empty title="Geen vestigingen" body="Deze organisatie heeft nog geen vestiging ingericht." />
            ) : (
              <ul className="max-h-48 overflow-y-auto">
                {tenant.branches.map((b) => (
                  <li key={b.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                    <span className="min-w-0 truncate font-medium" style={{ color: "var(--a-text)" }}>{b.name}</span>
                    {b.city && <span className="flex-shrink-0 text-xs" style={{ color: "var(--a-mute)" }}>{b.city}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel flush title="Facturen" subtitle={`${count(activity.invoices.length)} facturen`}>
        <DataTable
          columns={[
            { key: "number", label: "Nummer" },
            { key: "type", label: "Soort", hideOnMobile: true },
            { key: "date", label: "Datum", hideOnMobile: true },
            { key: "total", label: "Totaal", align: "right" },
            { key: "status", label: "Status" },
            { key: "pdf", label: "", align: "right", sortable: false },
          ]}
          rows={invoiceRows}
          pageSize={8}
          searchPlaceholder="Zoek op nummer"
          filters={[{ key: "status", label: "Status", chips: true, options: [{ value: "ISSUED", label: "Open" }, { value: "PAID", label: "Betaald" }] }]}
          defaultSort={{ key: "date", dir: "desc" }}
          emptyText="Nog geen facturen."
        />
      </Panel>

      <Panel flush title="Klussen" subtitle={`De laatste ${count(activity.shifts.length)}`}>
        <DataTable
          columns={[
            { key: "title", label: "Klus" },
            { key: "branch", label: "Vestiging", hideOnMobile: true },
            { key: "date", label: "Wanneer", hideOnMobile: true },
            { key: "filled", label: "Ingevuld", align: "right" },
            { key: "status", label: "Status" },
          ]}
          rows={shiftRows}
          pageSize={8}
          searchPlaceholder="Zoek op klus"
          defaultSort={{ key: "date", dir: "desc" }}
          emptyText="Nog geen klussen."
        />
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel flush title="Gebruikers" subtitle={`${count(tenant.memberships.length)} gekoppeld`}>
          {tenant.memberships.length === 0 ? (
            <Empty title="Geen gebruikers" body="Nog niemand gekoppeld aan deze organisatie." />
          ) : (
            <ul>
              {tenant.memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <NameCell name={m.user.fullName} sub={ROLE_LABEL[m.role] ?? m.role} href={`/admin/gebruikers/${m.user.id}`} />
                  <Pill tone={m.user.disabledAt ? "crit" : "ok"}>{m.user.disabledAt ? "Geblokkeerd" : "Actief"}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Wat er gebeurde" subtitle="Het auditspoor van deze organisatie">
          <Feed
            emptyText="Er is nog niets vastgelegd."
            items={auditEntries.map((e) => ({
              key: e.id,
              text: e.summary,
              meta: `${dateTimeNl(e.createdAt)}, ${e.category}`,
              ...(e.severity === "critical" ? { tone: "crit" as const } : e.severity === "warning" ? { tone: "warn" as const } : {}),
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
