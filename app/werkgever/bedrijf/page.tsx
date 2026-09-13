import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { reviewSummary } from "@/lib/reviews/store";
import Link from "next/link";
import { PageHeader, Panel, EmptyState } from "@/components/app/ui";
import { OrgProfileForm } from "@/components/app/OrgProfileForm";
import { mailPrefsView } from "@/lib/mail/prefs";
import { MailPrefsToggles } from "@/components/marketing/MailPrefsToggles";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

function Stars({ n }: { n: number }) {
  return (
    <span className="text-amber-500">
      {"★★★★★".slice(0, Math.round(n))}
      <span className="text-neutralx-300">{"★★★★★".slice(Math.round(n))}</span>
    </span>
  );
}

export default async function WerkgeverBedrijfPage() {
  const c = (await getDict()).company;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  if (!tenantId) {
    return (
      <>
        <PageHeader title={c.title} subtitle={c.subtitle.replace("{org}", "")} />
        <EmptyState title={c.noOrgTitle} body={c.noOrgBody} />
      </>
    );
  }

  const [tenant, extra, reviews, mailPrefs] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    getOrgProfileExtra(tenantId),
    reviewSummary("company", tenantId),
    mailPrefsView(principal.email),
  ]);

  return (
    <>
      <PageHeader
        title={c.title}
        eyebrow={c.eyebrow}
        subtitle={fmt(c.subtitle, { org: tenant?.name ?? c.title })}
      />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title={c.editPanel}>
          <div className="p-5">
            <OrgProfileForm
              tenantId={tenantId}
              initial={{
                ...(extra.websiteUrl ? { websiteUrl: extra.websiteUrl } : {}),
                ...(extra.about ? { about: extra.about } : {}),
                hasPhoto: Boolean(extra.photoUploadId),
              }}
            />
          </div>
        </Panel>

        <Panel
          title={c.reviewsPanel}
          action={
            reviews.count > 0 ? (
              <Link href="/werkgever/reviews" className="text-xs font-medium text-brand-600">
                {c.allReviews}
              </Link>
            ) : undefined
          }
        >
          {reviews.count === 0 ? (
            <EmptyState title={c.reviewsEmptyTitle} body={c.reviewsEmptyBody} />
          ) : (
            <div className="p-5">
              <p className="text-sm">
                <Stars n={reviews.average} />{" "}
                <span className="font-semibold text-ink">{reviews.average}</span>{" "}
                <span className="text-neutralx-500">{fmt(c.reviewsSummary, { n: reviews.count })}</span>
              </p>
              <ul className="mt-4 space-y-3">
                {reviews.recent.slice(0, 8).map((r) => (
                  <li key={r.id} className="rounded-lg bg-paper-soft p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{r.authorName}</span>
                      <Stars n={r.rating} />
                    </div>
                    {r.text && <p className="mt-1 text-sm text-neutralx-600">{r.text}</p>}
                    {r.shiftTitle && <p className="mt-1 text-[11px] text-neutralx-400">{r.shiftTitle}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title={c.mailPanel}>
          <div className="p-5">
            <p className="mb-4 text-sm text-neutralx-600">{c.mailIntro}</p>
            <MailPrefsToggles
              token={mailPrefs.token}
              initialCategories={mailPrefs.categories}
              initialUnsubscribedAll={mailPrefs.unsubscribedAll}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
