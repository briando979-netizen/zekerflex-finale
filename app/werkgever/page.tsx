import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { WelcomeBack } from "@/components/app/WelcomeBack";
import { EmployerDashboardHero } from "@/components/app/EmployerDashboardHero";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope, getEmployerOverview } from "@/lib/dashboard/employer";
import { pendingEmployerReviews } from "@/lib/reviews/pending";
import { heeftVestiging } from "@/lib/onboarding/employer";
import { eersteKlusFeiten, GEEN_KLUS } from "@/lib/onboarding/eerste-klus";
import { werkgeverStappen, berekenVoortgang } from "@/lib/onboarding/voortgang";
import { heeftOmslagfoto } from "@/lib/werkgever/bedrijfsprofiel";
import { werkgeverKaartTeksten } from "@/lib/onboarding/werkgever-teksten";
import { OnboardingProgress } from "@/components/app/OnboardingProgress";
import { tenantVerification } from "@/lib/company/verified";
import { controleStand } from "@/lib/company/gecontroleerd";
import { OnboardingOnderhoudBalk } from "@/components/app/OnboardingOnderhoudBalk";
import { OpbouwfaseBalk } from "@/components/app/OpbouwfaseBalk";
import { maakBrancheKeuze } from "@/lib/shifts/branche-keuze";
import { prisma } from "@/lib/prisma";
import { getOrgProfileExtra, type OrgProfileExtra } from "@/lib/profile/store";
import { recentThreads } from "@/lib/messaging/recent";
import {
  KpiCard,
  Panel,
  EmptyState,
  StatusPill,
  money,
  moneyExact,
  dateTime,
} from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { EmployerShiftCard } from "@/components/app/EmployerShiftCard";
import { RecentMessagesPanel } from "@/components/app/RecentMessagesPanel";
import { EmployerOnboardingWizard } from "@/components/app/EmployerOnboardingWizard";
import { KlusConceptNudge } from "@/components/app/KlusConceptNudge";
import { getDict, getLocale } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";
import { followerCount } from "@/lib/worker/follows";
import { zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { getPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";
import { kl, startMarges } from "@/lib/werkgever/start-marges";
import { vestigingRegel } from "@/lib/geo/adres-keuze";
import { metLand } from "@/lib/geo/vestiging-land";
import { werklocatieKeuzes } from "@/lib/geo/vestiging-buitenland";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";

export const dynamic = "force-dynamic";

export default async function WerkgeverStartPage() {
  const t = await getDict();
  const ws = t.werkgeverStart;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];

  // de vlag `publiek-alleen-flexwerk`
  const alleenFlexwerk = await alleenFlexwerkAan().catch(() => false);

  const [adresKlaar, extra, o, threads, verificatie, pendingReviews, followers, eersteKlus] = await Promise.all([
    // het adres van de werklocatie is bevestigd (23 nov 2026: geen KVK-stap meer; die controle komt pas bij het inplannen)
    heeftVestiging(scope.tenantIds),
    tenantId ? getOrgProfileExtra(tenantId) : Promise.resolve({} as OrgProfileExtra),
    getEmployerOverview(principal),
    recentThreads(principal.userId, false, 4),
    tenantId ? tenantVerification(tenantId) : Promise.resolve({ verified: true, via: null, inControle: false, buitenlands: false }),
    pendingEmployerReviews(principal).catch(() => []),
    followerCount(scope.tenantIds).catch(() => 0),
    // blok 2 van Jouw start: wat er met de eerste klus al gebeurd is
    tenantId ? eersteKlusFeiten(tenantId).catch(() => GEEN_KLUS) : Promise.resolve(GEEN_KLUS),
  ]);
  const companyVerified = verificatie.verified;
  const locale = await getLocale();

  const ob = extra.onboarding ?? {};
  const answers: Record<string, string> = {};
  for (const k of ["role", "sector", "shortageFrequency", "urgency", "priorPlatform", "heardFrom"] as const) {
    if (ob[k]) answers[k] = ob[k]!;
  }
  const orgAnswered = Boolean(answers.role || answers.sector);
  const emailVerified = Boolean(principal.emailVerifiedAt);
  // twee blokken (lib/onboarding/voortgang.ts). 23 nov 2026 (eigenaar: de onboarding precies zoals YoungOnes): de checklist met de twee
  // blokken naast elkaar blijft het startscherm tot ook "Jouw eerste klus" af is (er is iemand ingepland), en zolang staat er niets
  // anders onder: geen takenlijst, geen cijfers, geen panelen. Daarna komt het gewone startscherm.
  const startFeiten = {
    orgBeantwoord: orgAnswered,
    adresKlaar,
    profielKlaar: Boolean(ob.profileStepDone),
    emailBevestigd: emailVerified,
    heeftKlus: eersteKlus.heeftKlus,
    heeftReactie: eersteKlus.heeftReactie,
    heeftIngepland: eersteKlus.heeftIngepland,
  };
  const canOnboard = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  const showWizard = canOnboard && !berekenVoortgang(werkgeverStappen(startFeiten)).klaar;
  const kaart = werkgeverKaartTeksten(locale);
  // een bedrijf dat zijn gegevens invulde om iemand in te plannen en wacht op ZekerFlex: een rustige regel, geen waarschuwing
  const wachtOpControle = controleStand({ gecontroleerd: companyVerified, aanvraag: extra.controle }) === "aangevraagd";
  // de vaste werklocatie die er al is (Locaties of Klus uitzetten): de adres-stap toont hem alleen
  const bestaandeVestiging =
    showWizard && adresKlaar && tenantId
      ? await prisma.branch
          .findFirst({ where: { tenantId, kind: "PERMANENT" }, orderBy: { createdAt: "asc" }, select: { name: true, addressLine: true, postalCode: true, city: true } })
          .catch(() => null)
      : null;
  // de vlaggen `werk-in-belgie` en `werk-in-buitenland` (standaard uit): bij de adres-stap ook een ander land kunnen kiezen
  const landen = showWizard && !adresKlaar ? await werklocatieKeuzes(principal, locale) : null;
  // Startmodus: nog bezig met de stappen. Dan is het startscherm alleen de kop en de twee blokken van Jouw start; de groet, de
  // takenlijst, de cijfers en de panelen komen pas daarna (23 nov 2026, zoals bij YoungOnes; eerder alleen bij een leeg bedrijf).
  // De klussen, uren en facturen zelf blijven gewoon bereikbaar via het menu.
  const startModus = showWizard;

  // Warme, contextuele subregel bij de groet — wat vraagt nu om aandacht?
  const greetSub =
    o.kpis.toApprove > 0
      ? fmt(o.kpis.toApprove === 1 ? ws.greetKeurEen : ws.greetKeurMeer, { n: o.kpis.toApprove })
      : o.kpis.openShifts > 0
        ? fmt(o.kpis.openShifts === 1 ? ws.greetOpenEen : ws.greetOpenMeer, { n: o.kpis.openShifts })
        : undefined;

  // De onderdelen onder de kop. De beheerder versleept en verbergt ze in de Site-ontwerper (Pagina's, "Startscherm
  // werkgevers-app"); zonder eigen indeling staat alles precies zoals het stond, met dezelfde tussenruimte.
  const zichtbaar = zichtbareSecties("werkgever-start", await getPaginaIndeling("werkgever-start"));
  const marge = startMarges(zichtbaar, { volgers: followers === 0, beoordelingen: pendingReviews.length === 0, berichten: threads.length === 0 });
  // Met de vlag `publiek-alleen-flexwerk` (20 nov, eigenaar): het startscherm als takenlijst, en alleen wat over klussen
  // plaatsen en uren goedkeuren gaat. De cijfers en de volgersregel vallen weg; de kop-banner ook. Teksten: ws.teDoen…
  const openFacturen = o.invoices.filter((i) => i.status === "ISSUED").length;
  const rij = (n: number, een: string, meer: string, href: string) => (n > 0 ? [{ n, tekst: n === 1 ? een : meer, href }] : []);
  const teDoen: { n: number; tekst: string; href: string }[] = [
    ...rij(o.kpis.toApprove, ws.teDoenUrenEen, ws.teDoenUrenMeer, "/werkgever/uren"),
    ...rij(o.kpis.openShifts, ws.teDoenKlusEen, ws.teDoenKlusMeer, "/werkgever/diensten"),
    ...rij(pendingReviews.length, ws.teDoenBeoordelingEen, ws.teDoenBeoordelingMeer, `/werkgever/diensten/${pendingReviews[0]?.shiftId ?? ""}`),
    ...rij(openFacturen, ws.teDoenFactuurEen, ws.teDoenFactuurMeer, "/werkgever/facturen"),
  ];
  const teDoenBlok = (
    <section aria-labelledby="tedoen-kop" className="mb-8 rounded-2xl border border-hair bg-white p-5 shadow-card">
      <h2 id="tedoen-kop" className="font-display text-lg font-bold text-ink">{ws.teDoenKop}</h2>
      {teDoen.length === 0 ? (
        <p className="mt-2 text-sm text-neutralx-600">{ws.teDoenLeeg}</p>
      ) : (
        <ul className="mt-3 divide-y divide-hair">
          {teDoen.map((r) => (
            <li key={r.href + r.tekst}>
              <Link href={r.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand-600">
                <span>
                  <span className="num mr-2 inline-grid h-7 min-w-7 place-items-center rounded-full bg-warn/10 px-2 font-mono text-xs font-bold text-warn">{r.n}</span>
                  <span className="font-medium text-ink">{r.tekst}</span>
                </span>
                <span aria-hidden className="text-neutralx-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/werkgever/diensten/nieuw" className="btn-primary mt-4 inline-flex">
        {t.start.placeShift}
      </Link>
    </section>
  );
  const zichtbaarFlex = alleenFlexwerk ? zichtbaar.filter((id) => id !== "cijfers" && id !== "volgers") : zichtbaar;
  const onderdelen: Record<string, ReactNode> = {
    cijfers: (
      <div className={kl(marge.cijfers, "grid gap-4 sm:grid-cols-2 lg:grid-cols-4")}>
        <KpiCard label={t.start.kpiOpen} value={String(o.kpis.openShifts)} tone={o.kpis.openShifts > 0 ? "warn" : "default"} />
        <KpiCard
          label={t.start.kpiToApprove}
          value={String(o.kpis.toApprove)}
          tone={o.kpis.toApprove > 0 ? "warn" : "default"}
          hint={t.start.kpiToApproveHint}
        />
        <KpiCard label={t.start.kpiSpent} value={money(o.kpis.spentThisMonthCents)} tone="brand" />
        <KpiCard label={t.start.kpiActive} value={String(o.kpis.activeFreelancers)} hint={t.start.kpiActiveHint} />
      </div>
    ),
    volgers: (
      followers > 0 ? (
        <div className={kl(marge.volgers, "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hair bg-brand-50 px-4 py-3 text-sm text-neutralx-700")}>
          <p>
            <span aria-hidden>❤️ </span>
            <span className="font-semibold text-ink">
              {fmt(followers === 1 ? ws.volgtEen : ws.volgtMeer, { n: followers, org: o.orgName })}
            </span>{" "}
            {ws.volgtNa}
          </p>
          <Link href="/werkgever/diensten/nieuw" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline sm:min-h-0">
            {ws.plaatsDienst}
          </Link>
        </div>
      ) : null
    ),
    beoordelingen: (
      pendingReviews.length > 0 ? (
        <div className={kl(marge.beoordelingen)}>
          <Panel title={t.reviewPrompt.title}>
            <p className="px-5 pt-4 text-sm text-neutralx-600">{t.reviewPrompt.body}</p>
            <ul className="mt-2 divide-y divide-hair">
              {pendingReviews.map((r) => (
                <li key={`${r.shiftId}-${r.freelancerName}`}>
                  <Link
                    href={`/werkgever/diensten/${r.shiftId}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-paper-soft"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{r.freelancerName}</span>
                      <span className="block truncate text-xs text-neutralx-500">{r.shiftTitle}</span>
                    </span>
                    <span className="flex-shrink-0 text-neutralx-400" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null
    ),
    werk: (
      <div className={kl(marge.werk, "grid gap-6 lg:grid-cols-2")}>
        <Panel
          title={t.start.upcomingTitle}
          action={
            <Link href="/werkgever/diensten" className="text-xs font-medium text-brand-600">
              {t.common.all}
            </Link>
          }
        >
          {o.shifts.length === 0 ? (
            <EmptyState
              title={t.start.upcomingEmptyTitle}
              body={t.start.upcomingEmptyBody}
            />
          ) : (
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {o.shifts.slice(0, 4).map((s) => (
                <EmployerShiftCard key={s.id} shift={s} href={`/werkgever/diensten/${s.id}`} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={t.start.approvalsTitle}
          action={
            <Link href="/werkgever/uren" className="text-xs font-medium text-brand-600">
              {t.common.all}
            </Link>
          }
        >
          {o.approvals.length === 0 ? (
            <EmptyState title={t.start.approvalsEmptyTitle} body={t.start.approvalsEmptyBody} />
          ) : (
            <ul className="divide-y divide-hair">
              {o.approvals.map((ap) => (
                <li key={ap.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{ap.freelancer}</p>
                    <p className="text-xs text-neutralx-500">
                      {ap.branch} · {dateTime(ap.scheduledStart)} · {(ap.billableMinutes / 60).toFixed(1)} u
                    </p>
                  </div>
                  <span className="num flex-shrink-0 font-mono text-sm text-ink">
                    {moneyExact(Math.round((ap.billableMinutes / 60) * ap.hourlyRateCents))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    ),
    berichten: (
      threads.length > 0 ? (
        <div className={kl(marge.berichten)}>
          <Panel
            title={t.start.messagesTitle}
            action={
              <Link href="/werkgever/berichten" className="text-xs font-medium text-brand-600">
                {t.common.all}
              </Link>
            }
          >
            <RecentMessagesPanel threads={threads} allHref="/werkgever/berichten" />
          </Panel>
        </div>
      ) : null
    ),
    facturen: (
      <div className={kl(marge.facturen)}>
        <Panel
          title={t.start.invoicesTitle}
          action={
            <Link href="/werkgever/facturen" className="text-xs font-medium text-brand-600">
              {t.common.all}
            </Link>
          }
        >
          {o.invoices.length === 0 ? (
            <EmptyState title={t.start.invoicesEmptyTitle} body={t.start.invoicesEmptyBody} />
          ) : (
            // Four columns don't fit a phone: scroll sideways there instead of widening the page.
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">{t.start.invNr}</th>
                  <th className="px-5 py-2.5 font-medium">{t.start.invType}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.start.invAmount}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.start.invStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {o.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{i.number}</td>
                    <td className="px-5 py-3 text-neutralx-600">
                      {i.type === "PLATFORM_FEE" ? t.start.invFee : t.start.invShift}
                    </td>
                    <td className="num px-5 py-3 text-right font-medium">{moneyExact(i.totalCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill tone={i.status === "PAID" ? "ok" : i.status === "ISSUED" ? "warn" : "neutral"}>
                        {i.status === "PAID" ? t.start.statusPaid : i.status === "ISSUED" ? t.start.statusOpen : i.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Panel>
      </div>
    ),
  };

  return (
    <>
      {/* alleen hier, niet meer op elke werkgeverspagina (22 nov 2026, gebruikersonderzoek punt 14: hij duwde alles een half scherm omlaag) */}
      {!startModus && <OpbouwfaseBalk />}
      {!startModus && <WelcomeBack name={principal.fullName} labels={t.greet} {...(greetSub ? { subtitle: greetSub } : {})} />}
      {!startModus && !alleenFlexwerk && <EmployerDashboardHero />}
      {/* ook in de startmodus: een nieuw bedrijf met een klus van /klus-plaatsen zet die meteen uit (22 nov 2026) */}
      <KlusConceptNudge />
      {/* Geen banner "je bedrijf wordt gecontroleerd" meer (23 nov 2026): een nieuw bedrijf plaatst meteen en de controle komt pas
          als het iemand wil inplannen. Heeft het zijn gegevens daarvoor ingevuld, dan een rustige regel. */}
      {/* ook tijdens Jouw start: het is de reden dat de stap "kies een freelancer" nog open staat */}
      {wachtOpControle && (
        <p role="status" className="mb-8 rounded-xl border border-hair bg-paper-soft px-4 py-3 text-sm text-neutralx-700">
          {ws.controleAangevraagd}
        </p>
      )}
      {showWizard && <OnboardingOnderhoudBalk />}
      {/* na de grote checklist: wat er van de eerste klus nog open staat (reacties bekijken, een freelancer kiezen); verdwijnt vanzelf */}
      {!showWizard && canOnboard && !startModus && (
        <OnboardingProgress
          voortgang={berekenVoortgang(werkgeverStappen(startFeiten).filter((s) => s.blok === 2))}
          steps={kaart.stappen}
          texts={kaart.kaart}
        />
      )}
      {showWizard ? (
        <section className="mb-12">
          {/* de kop van Jouw start: de titel in hoofdletters en één regel uitleg, daaronder de twee blokken naast elkaar */}
          <PaginaKop title={t.start.welcomeTitle} subtitle={fmt(t.start.welcomeBody, { org: o.orgName })} />
          <div>
            <EmployerOnboardingWizard
              initial={{
                adresKlaar,
                profileStepDone: Boolean(ob.profileStepDone),
                emailVerified,
                // de omslagfoto is alleen in dit scherm een stap: er is een foto, of de stap is bewust overgeslagen
                omslagKlaar: heeftOmslagfoto(extra),
                profiel: { websiteUrl: extra.websiteUrl ?? "", about: extra.about ?? "" },
                answers,
                brancheKeuze: maakBrancheKeuze({ alle: ob.alleBranches, branches: ob.branches }),
                // een werklocatie buiten Nederland krijgt het land erachter ("…, België"); een Nederlandse blijft zoals hij was
                vestiging: bestaandeVestiging ? { naam: bestaandeVestiging.name, adres: metLand(vestigingRegel(bestaandeVestiging), bestaandeVestiging.postalCode, locale) } : null,
                eersteKlus,
                landen,
              }}
            />
          </div>
        </section>
      ) : (
        <PaginaKop
          title={t.start.eyebrow}
          subtitle={t.start.dashSubtitle}
          action={
            <Link href="/werkgever/diensten/nieuw" className="btn-primary">
              {t.start.placeShift}
            </Link>
          }
        />
      )}

      {/* in de startmodus staat hieronder niets: eerst Jouw start afmaken (zie startModus) */}
      {!startModus && alleenFlexwerk && teDoenBlok}
      {!startModus &&
        zichtbaarFlex.map((id) => (
          <Fragment key={id}>{onderdelen[id]}</Fragment>
        ))}
    </>
  );
}
