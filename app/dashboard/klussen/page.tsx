import Link from "next/link";
import { redirect } from "next/navigation";
import { startSchermTonen } from "@/lib/onboarding/werker-poort";
import { UITZEND_ALLEEN_VIA_BUREAU } from "@/lib/fiscal/eligibility";
import { WelcomeBack } from "@/components/app/WelcomeBack";
import { TodayStrip } from "@/components/app/TodayStrip";
import { MilestoneCelebration } from "@/components/app/MilestoneCelebration";
import { GeldVerdienenKaart } from "@/components/app/GeldVerdienenKaart";
import { requirePrincipal } from "@/lib/auth";
import { getMarketplace } from "@/lib/dashboard/marketplace";
import { todaysShifts, completedKlussenCount } from "@/lib/dashboard/today";
import { getFiscal } from "@/lib/fiscal/store";
import { isBirthdayToday } from "@/lib/birthday";
import { StatusPill } from "@/components/app/ui";
import { MarketplaceView } from "@/components/app/MarketplaceView";
import { getFreelancerDict } from "@/lib/i18n/server";
import { translateBlockReason } from "@/lib/i18n/freelancer";
import { alleenTestklussen, geenEchteInDeBuurt } from "@/lib/shifts/testklus";
import { getBrancheKeuze } from "@/lib/worker/branche-store";
import { standaardFilter } from "@/lib/shifts/branche-keuze";
import { EersteIndrukMelding } from "@/components/app/EersteIndrukMelding";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { nogVoorEersteKlusVan } from "@/lib/onboarding/klaar-voor-klus-server";
import { inEigenApp } from "@/lib/app-mode-server";
import { AppVoorstelKaart } from "@/components/app/AppVoorstelKaart";

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

  const [fiscal, today, completed] = await Promise.all([
    getFiscal(principal.userId),
    todaysShifts(principal.userId),
    completedKlussenCount(principal.userId),
  ]);
  const birthday = isBirthdayToday(fiscal.birthDate);
  // De app is sinds 12 nov open (eigenaar): wie de onboarding nog niet af heeft, ziet hier de stappen bovenaan en
  // reageert pas daarna (lib/onboarding/werker-poort-server.ts). Een storing: geen stappen. Testaccounts zien de stappen
  // ook (15 nov); alleen het reageren laten we ze toe (onboardingKlaarVoorReageren), voor de beoordelaars van Apple en Google.
  const poort = await werkerPoortStand(principal.userId).catch(() => null);
  // een nieuw account zonder branchekeuze begint met de twee volschermstappen (locatie, branches), zoals de app van
  // YoungOnes (20 nov, eigenaar); daarna staan de overige stappen hier bovenaan
  if (poort && startSchermTonen(poort, poort.aangemeldOp)) redirect("/dashboard/start");
  const onboardingOpen = poort !== null && !poort.klaar;
  // daarna: wat er nog nodig is om te reageren (ID goedgekeurd, BSN, overeenkomst, KVK/btw, rekeningnummer), als één lijst
  // met dezelfde regels als de controle bij reageren (lib/onboarding/klaar-voor-klus.ts). Eén kaart tegelijk (15 nov, eigenaar)
  const nogVoorKlus = !onboardingOpen && !m.canApply ? await nogVoorEersteKlusVan(principal.userId).catch(() => []) : [];
  // het voorstel om de app te installeren: na de startstappen tot en met de ID-check, en alleen in een gewone browser
  const toonAppVoorstel = poort?.identiteitIngestuurd === true && !(await inEigenApp());
  const greetLabels = {
    morning: t.greet.morning,
    afternoon: t.greet.afternoon,
    evening: t.greet.evening,
    firstVisit: t.greet.firstVisit,
    back: t.greet.back,
    birthday: t.greet.birthday,
  };
  // Alleen testklussen (lib/shifts/testklus.ts)? Dan geen "ontdek"-regel onder de groet (de kaart zelf zegt er niets over).
  const alleenTest = alleenTestklussen(m.shifts);
  // wel klussen, maar geen echte binnen de reistijd van de werker: één eerlijke zin bovenaan de lijst
  const geenEchtInBuurt = m.shifts.length > 0 && geenEchteInDeBuurt(m.shifts, m.prefs.maxTravelMinutes);
  // Een uitzendkracht (geen KVK) mag alleen op uitzendklussen van een uitzendbureau reageren (lib/fiscal/eligibility.ts). Dan
  // geen balk "reageren kan zodra dat rond is" (21 nov, op de telefoon gezien: op uitzendklussen kan hij al reageren), en het
  // filter staat op Uitzendklussen.
  const alleenUitzend = !m.canApply && m.blockReason === UITZEND_ALLEEN_VIA_BUREAU;
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
      {/* na "Opslaan" in /dashboard/eerste-indruk: alleen het goede nieuws als reageren echt kan (m.canApply), anders eerlijk wat er nog mist */}
      {searchParams.eerste === "1" && (
        <EersteIndrukMelding
          goed={m.canApply}
          sluiten={t.eersteIndruk.melding.close}
          tekst={m.canApply ? t.eersteIndruk.melding.klaar : `${t.eersteIndruk.melding.nogNiet}${m.blockReason ? ` ${translateBlockReason(m.blockReason, t)}` : ""}`}
        />
      )}
      {/* Sinds 21 nov (eigenaar: "alles weg en in de stijl van YoungOnes, alleen de chat bewaren"): bovenaan één turquoise kaart,
          de stappen zelf staan op /dashboard/start/profiel. De pushkaart, "eerste indruk" en de tip staan op Account.
          Het recht om te werken zit niet in de start (10 nov); aannemen vraagt het wel (lib/werkrecht). */}
      {/* 21 nov (eigenaar: "haal regel je verificatie weg bij werknemer dashboard"): geen kaart "Regel je verificatie" meer; wat er
          nog mist, zie je bij het reageren en op /dashboard/start/profiel. Dan ook niet de reden-balk eronder. */}
      {poort && onboardingOpen ? (
        <GeldVerdienenKaart kop={t.start.geldKop} tekst={t.start.geldTekst} knop={t.start.geldKnop} href="/dashboard/start/profiel" />
      ) : nogVoorKlus.length > 0 || alleenUitzend ? null : (
        // iets anders houdt reageren tegen (bijv. de KVK-controle wacht, of matching is tijdelijk beperkt): de echte reden
        !m.canApply &&
        m.blockReason && (
          <div className="card mb-6 border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
            {t.page.browseFirst} {translateBlockReason(m.blockReason, t)} {t.page.applyWhenDone}
          </div>
        )
      )}
      {/* proefklussen (21 nov, eigenaar; lib/fiscal/proefklussen-kern.ts): reageren mag al, het geld komt pas met de gegevens. Geen belofte over uitbetalen. */}
      {m.canApply && m.proefklussenOver !== undefined && (
        <p className="card mb-5 p-5 text-sm text-neutralx-600">
          {t.start.proefHint}{" "}
          <Link href="/dashboard/verificatie#gegevens-later-kop" className="text-brand-600 underline">
            {t.start.proefKnop}
          </Link>
        </p>
      )}
      {/* "eerst browser, dan app" (22 nov 2026, eigenaar): pas na de ID-check, en niet in de app zelf, een wegklikbaar voorstel
          om de app te installeren (de kaart verbergt zich ook in een geïnstalleerde web-app) */}
      {toonAppVoorstel && <AppVoorstelKaart />}
      {m.newSinceLastVisit > 0 && (
        <p className="mb-4">
          <StatusPill tone="ok">{t.page.newCount(m.newSinceLastVisit)}</StatusPill>
        </p>
      )}

      {/* 21 nov (eigenaar): de grote melding over testklussen is weg; testklussen staan onderaan (echteKlussenEerst). 22 nov
          (gebruikersonderzoek punt 12): wel één eerlijke zin bovenaan de lijst als er geen echte klus in de buurt is. Een lege
          lijst heeft zijn eigen uitleg (leeg hieronder). */}
      {geenEchtInBuurt && (
        <p className="mb-4 text-sm leading-snug text-neutralx-600" role="status">
          {t.page.geenEchtInBuurt}{" "}
          <Link href="/dashboard/account" className="font-semibold text-brand-600 underline underline-offset-2">
            {t.eersteIndruk.meldingen.knop}
          </Link>
        </p>
      )}

      {/* ook zonder klussen staat de filterbalk met het zoekveld er (YoungOnes; het vergrootglas in de balk springt naar #zoeken).
          Het lege vak heeft één actie: naar de meldingen. De knop zelf staat sinds 21 nov op Account (daar kent hij zijn stand op dit apparaat). */}
      <MarketplaceView
        shifts={m.shifts}
        home={m.home}
        homeLabel={m.homeLabel}
        initialQuery={initialQuery}
        defaultBranches={standaardFilter(brancheKeuze)}
        // uitzendkracht zonder KVK: het filter Type klus staat standaard op Uitzendklussen (zoals YoungOnes)
        {...(alleenUitzend ? { alleenUitzend: true } : {})}
        canApply={m.canApply}
        blockReason={m.blockReason}
        defaultMinRateCents={m.prefs.minHourlyRateCents}
        defaultMaxTravel={m.prefs.maxTravelMinutes}
        leeg={{ titel: t.page.noJobsTitle, tekst: t.page.noJobsBody, knop: t.eersteIndruk.meldingen.knop, href: "/dashboard/account" }}
      />
    </>
  );
}
