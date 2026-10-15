import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { payToken } from "@/lib/billing/pay-link";
import { PageHeader, Panel, EmptyState, KpiCard, StatusPill, money, moneyExact, dateTime } from "@/components/app/ui";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  PLATFORM_FEE: "Platformfee",
  SELF_BILL_FREELANCER: "Dienst (zzp)",
  CANCELLATION_PENALTY: "Annuleringsvergoeding",
  UITZEND_FEE: "Uitzendkracht (loon + opslag)",
};

const STATUS_FILTERS = [
  { key: "", label: "Alles" },
  { key: "ISSUED", label: "Openstaand" },
  { key: "PAID", label: "Betaald" },
  { key: "DRAFT", label: "Concept" },
] as const;

// Platform-brede factuurlijst — tot nu toe bestond er alleen een per-werkgever
// weergave (/werkgever/facturen). Admin had geen enkel overzicht van omzet/
// openstaand over alle organisaties heen.
export default async function AdminFacturenPage(props: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <div className="mx-auto max-w-5xl"><PageHeader title="Geen toegang" subtitle="Facturatie-overzicht is alleen voor platformbeheerders." /></div>;
  }

  const searchParams = await props.searchParams;
  const status = STATUS_FILTERS.find((f) => f.key === (searchParams.status ?? ""))?.key ?? "";
  const q = searchParams.q?.trim() ?? "";

  const [invoices, totals] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(q ? { number: { contains: q, mode: "insensitive" } } : {}),
      },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        recipientTenantId: true,
        recipientFreelancerId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    prisma.invoice.groupBy({ by: ["status"], _sum: { totalCents: true }, _count: true }),
  ]);

  const tenantIds = [...new Set(invoices.map((i) => i.recipientTenantId).filter((id): id is string => Boolean(id)))];
  const tenants = tenantIds.length > 0 ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }) : [];
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));

  const freelancerIds = [...new Set(invoices.map((i) => i.recipientFreelancerId).filter((id): id is string => Boolean(id)))];
  const freelancers = freelancerIds.length > 0
    ? await prisma.freelancerProfile.findMany({ where: { id: { in: freelancerIds } }, select: { id: true, user: { select: { fullName: true } } } })
    : [];
  const freelancerName = new Map(freelancers.map((f) => [f.id, f.user.fullName]));

  const outstandingCents = totals.find((t) => t.status === "ISSUED")?._sum.totalCents ?? 0;
  const paidCents = totals.find((t) => t.status === "PAID")?._sum.totalCents ?? 0;
  const totalCount = totals.reduce((s, t) => s + t._count, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Facturen" subtitle="Alle facturen op het platform, over alle organisaties heen — omzet, openstaand en status." />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Openstaand" value={money(outstandingCents)} tone={outstandingCents > 0 ? "warn" : "default"} />
        <KpiCard label="Betaald" value={money(paidCents)} tone="brand" />
        <KpiCard label="Facturen" value={String(totalCount)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/admin/facturen${f.key ? `?status=${f.key}` : ""}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === f.key ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600 hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Zoek op factuurnummer…"
            className="w-60 rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-sm"
          />
          <button type="submit" className="btn-ghost text-sm">Zoeken</button>
        </form>
      </div>

      <Panel title={`${invoices.length} factu${invoices.length === 1 ? "ur" : "ren"}`}>
        {invoices.length === 0 ? (
          <EmptyState title="Niets gevonden" body="Pas het filter of je zoekopdracht aan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Nummer</th>
                  <th className="px-5 py-2.5 font-medium">Debiteur</th>
                  <th className="px-5 py-2.5 font-medium">Soort</th>
                  <th className="px-5 py-2.5 text-right font-medium">Totaal</th>
                  <th className="px-5 py-2.5 font-medium">Datum</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{i.number}</td>
                    <td className="px-5 py-3 text-neutralx-600">
                      {i.recipientTenantId ? (tenantName.get(i.recipientTenantId) ?? "—") : i.recipientFreelancerId ? (freelancerName.get(i.recipientFreelancerId) ?? "—") : "—"}
                    </td>
                    <td className="px-5 py-3 text-neutralx-600">{TYPE_LABEL[i.type] ?? i.type}</td>
                    <td className="num px-5 py-3 text-right font-medium">{moneyExact(i.totalCents)}</td>
                    <td className="px-5 py-3 text-neutralx-500">{dateTime(i.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill tone={i.status === "PAID" ? "ok" : i.status === "ISSUED" ? "warn" : "neutral"}>
                        {i.status === "PAID" ? "Betaald" : i.status === "ISSUED" ? "Open" : i.status}
                      </StatusPill>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-3">
                        {i.status === "ISSUED" && (i.recipientTenantId || i.recipientFreelancerId) && (
                          <a
                            href={`/betaal/${payToken(i.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-brand-600 hover:underline"
                            title="Openbare betaalpagina met QR-code — door te sturen naar de klant"
                          >
                            Betaallink / QR
                          </a>
                        )}
                        <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
                          PDF ↓
                        </a>
                      </span>
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
