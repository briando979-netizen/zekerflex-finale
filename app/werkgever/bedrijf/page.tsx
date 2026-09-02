import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { reviewSummary } from "@/lib/reviews/store";
import { PageHeader, Panel, EmptyState } from "@/components/app/ui";
import { OrgProfileForm } from "@/components/app/OrgProfileForm";
import { mailPrefsView } from "@/lib/mail/prefs";
import { MailPrefsToggles } from "@/components/marketing/MailPrefsToggles";

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
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  if (!tenantId) {
    return (
      <>
        <PageHeader title="Bedrijfsprofiel" subtitle="Zo zien freelancers jouw organisatie." />
        <EmptyState title="Geen organisatie" body="Aan dit account is geen organisatie gekoppeld." />
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
        title="Bedrijfsprofiel"
        eyebrow="Zichtbaar voor freelancers"
        subtitle={`Zo verschijnt ${tenant?.name ?? "je organisatie"} bij freelancers — met foto, website en reviews.`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Profiel bewerken">
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

        <Panel title="Reviews van freelancers">
          {reviews.count === 0 ? (
            <EmptyState title="Nog geen reviews" body="Freelancers kunnen je beoordelen na een afgeronde dienst." />
          ) : (
            <div className="p-5">
              <p className="text-sm">
                <Stars n={reviews.average} />{" "}
                <span className="font-semibold text-ink">{reviews.average}</span>{" "}
                <span className="text-neutralx-500">· {reviews.count} reviews</span>
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
        <Panel title="E-mailvoorkeuren">
          <div className="p-5">
            <p className="mb-4 text-sm text-neutralx-600">
              Kies welke optionele e-mail je ontvangt. Belangrijke e-mail (facturen, compliance, juridische
              kennisgevingen) krijg je altijd.
            </p>
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
