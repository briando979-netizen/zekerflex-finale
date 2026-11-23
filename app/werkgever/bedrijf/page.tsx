import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { reviewSummary } from "@/lib/reviews/store";
import Link from "next/link";
import { EmptyState } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { Kaart } from "@/components/werkgever/Kaart";
import { FormulierRij } from "@/components/werkgever/FormulierRij";
import { OrgProfileForm } from "@/components/app/OrgProfileForm";
import { mailPrefsView } from "@/lib/mail/prefs";
import { MailPrefsToggles } from "@/components/marketing/MailPrefsToggles";
import { FastPaySettings } from "@/components/werkgever/FastPaySettings";
import { VolumeCard } from "@/components/werkgever/VolumeCard";
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
  const dict = await getDict();
  const c = dict.company;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  if (!tenantId) {
    return (
      <>
        <PaginaKop title={c.title} subtitle={c.subtitle.replace("{org}", "")} />
        <EmptyState title={c.noOrgTitle} body={c.noOrgBody} />
      </>
    );
  }

  const [tenant, extra, reviews, mailPrefs] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    getOrgProfileExtra(tenantId),
    reviewSummary("company", tenantId),
    mailPrefsView(principal.email, "bedrijf"),
  ]);

  return (
    <>
      {/* een onderpagina van Instellingen: titel, "Terug naar instellingen" (23 nov 2026, zoals bij YoungOnes) */}
      <InstellingenKop title={c.title} />

      {/* één witte kaart met de blokken onder elkaar: links de kop en de uitleg, rechts de velden (components/werkgever/FormulierRij.tsx) */}
      <Kaart>
        <FormulierRij titel={c.editPanel} uitleg={fmt(c.subtitle, { org: tenant?.name ?? c.title })}>
          <OrgProfileForm
            tenantId={tenantId}
            initial={{
              ...(extra.websiteUrl ? { websiteUrl: extra.websiteUrl } : {}),
              ...(extra.about ? { about: extra.about } : {}),
              hasPhoto: Boolean(extra.photoUploadId),
            }}
          />
        </FormulierRij>

        <FormulierRij titel={c.reviewsPanel}>
          {reviews.count === 0 ? (
            // de lege staat is één regel tekst
            <p className="text-sm leading-relaxed text-neutralx-600">{c.reviewsEmptyBody}</p>
          ) : (
            <div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <Stars n={reviews.average} />
                <span className="font-semibold text-ink">{reviews.average}</span>
                <span className="text-neutralx-500">{fmt(c.reviewsSummary, { n: reviews.count })}</span>
                <Link href="/werkgever/reviews" className="ml-auto inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline">
                  {c.allReviews}
                </Link>
              </p>
              <ul className="mt-2 space-y-3">
                {reviews.recent.slice(0, 8).map((r) => (
                  <li key={r.id} className="rounded-lg bg-paper-soft p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{r.authorName}</span>
                      <Stars n={r.rating} />
                    </div>
                    {r.text && <p className="mt-1 text-sm text-neutralx-600">{r.text}</p>}
                    {r.shiftTitle && <p className="mt-1 text-[11px] text-neutralx-500">{r.shiftTitle}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </FormulierRij>

        {/* #notificaties: de kaart Notificaties op Instellingen en "Notificatievoorkeuren" in het gebruikersmenu komen hier uit, tot er een eigen pagina is */}
        <FormulierRij id="notificaties" titel={c.mailPanel} uitleg={c.mailIntro}>
          <MailPrefsToggles
            token={mailPrefs.token}
            initialCategories={mailPrefs.categories}
            initialUnsubscribedAll={mailPrefs.unsubscribedAll}
            kant="bedrijf"
          />
        </FormulierRij>
      </Kaart>

      <div className="mt-6 space-y-6">
        {/* maximum uren per werker en inchecken staan sinds 23 nov 2026 onder Instellingen → Klus-instellingen (/werkgever/instellingen/klussen) */}
        <VolumeCard />
        <FastPaySettings />
      </div>
    </>
  );
}
