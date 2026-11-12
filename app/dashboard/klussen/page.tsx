import Link from "next/link";
import { WelcomeBack } from "@/components/app/WelcomeBack";
import { TodayStrip } from "@/components/app/TodayStrip";
import { MilestoneCelebration } from "@/components/app/MilestoneCelebration";
import { WerkerStartWizard } from "@/components/app/WerkerStartWizard";
import { OnboardingProgress } from "@/components/app/OnboardingProgress";
import { requirePrincipal } from "@/lib/auth";
import { getMarketplace } from "@/lib/dashboard/marketplace";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { todaysShifts, completedKlussenCount } from "@/lib/dashboard/today";
import { getFiscal } from "@/lib/fiscal/store";
import { isBirthdayToday } from "@/lib/birthday";
import { StatusPill } from "@/components/app/ui";
import { MarketplaceView } from "@/components/app/MarketplaceView";
import { WilReagerenNudge } from "@/components/app/WilReagerenNudge";
import { getFreelancerDict } from "@/lib/i18n/server";
import { translateBlockReason } from "@/lib/i18n/freelancer";
import { alleenTestklussen } from "@/lib/shifts/testklus";
import { getBrancheKeuze } from "@/lib/worker/branche-store";
import { standaardFilter } from "@/lib/shifts/branche-keuze";
import { EersteIndrukMelding } from "@/components/app/EersteIndrukMelding";
import { eersteIndrukVoor } from "@/lib/onboarding/eerste-indruk-server";
import { inIosApp } from "@/lib/app-mode-server";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { isReservedTestAddress } from "@/lib/mail/test-adres";

export const dynamic = "force-dynamic";

export default async function KlussenPage(
  props: {
    searchParams: Promise<{ employer?: string; eerste?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const principal = await requirePrincipal();
  const m = await getMarketplace(principal.userId);
  const t = await getFreelancerDict();
  const initialQuery = typeof searchParams.employer === "string" ? searchParams.employer : "";
  // de branches die de werker bij de start koos (of alle): daarop staat de lijst standaard gefilterd
  const brancheKeuze = await getBrancheKeuze(principal.userId).catch(() => null);

  const [fiscal, today, completed, overview] = await Promise.all([
    getFiscal(principal.userId),
    todaysShifts(principal.userId),
    completedKlussenCount(principal.userId),
    getFreelancerOverview(principal.userId),
  ]);
  const birthday = isBirthdayToday(fiscal.birthDate);
  // De app is sinds 12 nov open (eigenaar): wie de onboarding nog niet af heeft, ziet hier de stappen bovenaan en
  // reageert pas daarna (lib/onboarding/werker-poort-server.ts). Testaccounts en een storing: geen stappen.
  const poort = isReservedTestAddress(principal.email) ? null : await werkerPoortStand(principal.userId).catch(() => null);
  const onboardingOpen = poort !== null && !poort.klaar;
  // de kaart "eerste indruk" pas na de onboarding; in de iPhone-app vraagt de app zelf om meldingen: daar telt die stap als klaar
  const eersteIndruk = onboardingOpen ? null : await eersteIndrukVoor(principal.userId, { iosApp: await inIosApp() }).catch(() => null);
  const greetLabels = {
    morning: t.greet.morning,
    afternoon: t.greet.afternoon,
    evening: t.greet.evening,
    firstVisit: t.greet.firstVisit,
    back: t.greet.back,
    birthday: t.greet.birthday,
  };
  // Alleen testklussen (lib/shifts/testklus.ts)? Dan zeggen we eerlijk dat er nog geen echt werk is.
  const alleenTest = alleenTestklussen(m.shifts);
  // Warme, contextuele subregel bij de groet — alleen als er iets te melden is.
  const greetSub =
    m.newSinceLastVisit > 0 ? t.greet.subNew : m.shifts.length > 0 && !alleenTest ? t.greet.subDiscover : undefined;

  return (
    <>
      <WelcomeBack
        name={principal.fullName}
        labels={greetLabels}
        {...(birthday ? { occasion: "birthday" as const } : {})}
        {...(greetSub ? { subtitle: greetSub } : {})}
      />
      <MilestoneCelebration count={completed} firstText={t.greet.milestoneFirst} nText={t.greet.milestoneN} />
      <TodayStrip
        shifts={today}
        labels={{ todayLabel: t.greet.todayLabel, todayAt: t.greet.todayAt, todayAtPlace: t.greet.todayAtPlace }}
      />
      <WilReagerenNudge />
      {/* na "Opslaan" in /dashboard/eerste-indruk: alleen het goede nieuws als reageren echt kan (m.canApply), anders eerlijk wat er nog mist */}
      {searchParams.eerste === "1" && (
        <EersteIndrukMelding
          goed={m.canApply}
          sluiten={t.eersteIndruk.melding.close}
          tekst={m.canApply ? t.eersteIndruk.melding.klaar : `${t.eersteIndruk.melding.nogNiet}${m.blockReason ? ` ${translateBlockReason(m.blockReason, t)}` : ""}`}
        />
      )}
      {/* de optionele stappen na de ID-controle (profielfoto, werkervaring): alleen zolang er nog een open staat; de poort zelf blijft ongemoeid */}
      {eersteIndruk && eersteIndruk.open > 0 && searchParams.eerste !== "1" && (
        <Link href="/dashboard/eerste-indruk" className="card mb-5 block p-4 hover:border-brand-500/40">
          <p className="font-display text-base font-bold text-ink">{t.eersteIndruk.card.title}</p>
          <p className="mt-1 text-sm text-neutralx-600">{t.eersteIndruk.card.body(eersteIndruk.open)}</p>
          <span className="mt-2 inline-block text-sm font-semibold text-brand-600">{t.eersteIndruk.card.open} ›</span>
        </Link>
      )}
      {/* het recht om te werken zit niet meer in de start (10 nov); aannemen vraagt het wel (lib/werkrecht) */}
      {/* de melding "we verbeteren de aanmelding" staat niet meer bij werkers (10 nov, eigenaar); werkgevers: flag onboarding-onderhoud */}
      {poort && onboardingOpen ? (
        <WerkerStartWizard
          workerKind={poort.workerKind}
          emailVerified={Boolean(principal.emailVerifiedAt)}
          profileComplete={poort.gegevensIngevuld && poort.identiteitIngestuurd}
          gegevensIngevuld={poort.gegevensIngevuld}
          identiteitIngestuurd={poort.identiteitIngestuurd}
          werkrechtOk
          tweestapAan={poort.tweestapAan}
          fotoGezet={poort.fotoGezet}
          brancheKeuze={poort.brancheKeuze}
        />
      ) : (
        !overview.profileComplete && (
          <WerkerStartWizard
            workerKind={fiscal.workerKind}
            emailVerified={Boolean(principal.emailVerifiedAt)}
            profileComplete={overview.profileComplete}
            werkrechtOk
            brancheKeuze={brancheKeuze}
          />
        )
      )}
      {/* de profiel-af-kaart staat er niet naast de startwizard: die dekt dezelfde open stappen */}
      {!onboardingOpen && overview.profileComplete && (
        <OnboardingProgress voortgang={overview.voortgang} steps={t.profielAf.steps} texts={t.profielAf} />
      )}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
            {t.nav.findJob}
          </h1>
          <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        </div>
        {m.newSinceLastVisit > 0 && (
          <StatusPill tone="ok">{t.page.newCount(m.newSinceLastVisit)}</StatusPill>
        )}
      </div>

      {/* De paarse kaart "naar verificatie" staat er niet meer (10 nov, eigenaar): de onboarding gaat nu
          vóór alles (lib/onboarding/werker-poort.ts) en de startwizard hierboven toont wat nog openstaat.
          Andere redenen (bijv. een document dat nog wordt nagekeken) blijven als gewone melding. */}
      {!m.canApply && m.blockReason && !/verificatie|geverifieerd/i.test(m.blockReason) && (
        <div className="card mb-6 border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
          {t.page.browseFirst} {translateBlockReason(m.blockReason, t)} {t.page.applyWhenDone}
        </div>
      )}

      {alleenTest && (
        <div className="card mb-5 p-5 text-sm">
          <p className="font-medium text-ink">{t.page.alleenTestTitle}</p>
          <p className="mt-1 text-neutralx-600">{t.page.alleenTestBody}</p>
        </div>
      )}

      {m.shifts.length === 0 ? (
        <div className="card">
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-ink">{t.page.noJobsTitle}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">
              {t.page.noJobsBefore} <Link href="/dashboard/beschikbaarheid" className="text-brand-600 underline">{t.page.availability}</Link>{" "}
              {t.page.noJobsAfter}
            </p>
          </div>
        </div>
      ) : (
        <MarketplaceView
          shifts={m.shifts}
          home={m.home}
          homeLabel={m.homeLabel}
          initialQuery={initialQuery}
          defaultBranches={standaardFilter(brancheKeuze)}
          canApply={m.canApply}
          blockReason={m.blockReason}
          defaultMinRateCents={m.prefs.minHourlyRateCents}
          defaultMaxTravel={m.prefs.maxTravelMinutes}
        />
      )}
    </>
  );
}
