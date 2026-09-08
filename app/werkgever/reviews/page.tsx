import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { listReviews, reviewSummary } from "@/lib/reviews/store";
import { PageHeader, EmptyState, dateShort } from "@/components/app/ui";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

function Stars({ n, className = "" }: { n: number; className?: string }) {
  const full = Math.round(n);
  return (
    <span className={`inline-flex ${className}`} aria-label={`${n} van 5 sterren`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" className={i <= full ? "text-amber-400" : "text-neutralx-300"}>
          <path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}

export default async function WerkgeverReviewsPage() {
  const rv = getDict().reviews;
  const co = getDict().company;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  if (!tenantId) {
    return (
      <>
        <PageHeader title={rv.title} subtitle={rv.subtitle} />
        <EmptyState title={co.noOrgTitle} body={co.noOrgBody} />
      </>
    );
  }

  const [tenant, summary, all] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    reviewSummary("company", tenantId),
    listReviews("company", tenantId),
  ]);

  const maxBar = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((s) => summary.distribution[s]));

  return (
    <>
      <div className="mb-6">
        <Link href="/werkgever" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← {rv.backToStart}
        </Link>
      </div>

      <PageHeader
        title={rv.title}
        eyebrow={tenant?.name ?? co.title}
        subtitle={rv.subtitle}
      />

      {summary.count === 0 ? (
        <EmptyState title={rv.emptyTitle} body={rv.emptyBody} />
      ) : (
        <>
          <div className="mb-8 grid gap-6 rounded-2xl border border-hair bg-white p-6 shadow-card sm:grid-cols-[auto_1fr]">
            <div className="text-center sm:pr-6">
              <p className="num font-display text-4xl font-bold text-ink">{summary.average.toFixed(1)}</p>
              <Stars n={summary.average} className="mt-1 justify-center" />
              <p className="mt-1 text-xs text-neutralx-500">
                {fmt(summary.count === 1 ? rv.countOne : rv.count, { n: summary.count })}
              </p>
            </div>
            <div className="space-y-1.5 sm:border-l sm:border-hair sm:pl-6">
              {([5, 4, 3, 2, 1] as const).map((s) => (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-neutralx-500">{s}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" className="text-amber-400">
                    <path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
                  </svg>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-soft">
                    <span
                      className="block h-full rounded-full bg-amber-400"
                      style={{ width: `${(summary.distribution[s] / maxBar) * 100}%` }}
                    />
                  </span>
                  <span className="num w-6 text-right text-neutralx-400">{summary.distribution[s]}</span>
                </div>
              ))}
            </div>
          </div>

          <ul className="space-y-3">
            {all.map((r) => (
              <li key={r.id} className="rounded-2xl border border-hair bg-white p-4 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
                      {r.authorName.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{r.authorName}</p>
                      <p className="text-[11px] text-neutralx-400">{fmt(rv.reviewer, { date: dateShort(r.at) })}</p>
                    </div>
                  </div>
                  <Stars n={r.rating} />
                </div>
                {r.text && <p className="mt-3 text-sm leading-relaxed text-neutralx-700">{r.text}</p>}
                {r.shiftTitle && (
                  <p className="mt-2 inline-block rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-500">
                    {r.shiftTitle}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
