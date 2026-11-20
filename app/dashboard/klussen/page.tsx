import Link from "next/link";
import { redirect } from "next/navigation";
import { startSchermTonen } from "@/lib/onboarding/werker-poort";
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
import { alleenTestklussen } from "@/lib/shifts/testklus";
import { getBrancheKeuze } from "@/lib/worker/branche-store";
import { standaardFilter } from "@/lib/shifts/branche-keuze";
import { EersteIndrukMelding } from "@/components/app/EersteIndrukMelding";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { nogVoorEersteKlusVan } from "@/lib/onboarding/klaar-voor-klus-server";

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
      {poort && onboardingOpen ? (
        <GeldVerdienenKaart kop={t.start.geldKop} tekst={t.start.geldTekst} knop={t.start.geldKnop} href="/dashboard/start/profiel" />
      ) : nogVoorKlus.length > 0 ? (
        <GeldVerdienenKaart kop={t.start.regelKop} tekst={t.start.regelTekst} knop={t.start.regelKnop} href="/dashboard/start/profiel" />
      ) : (
        // iets anders houdt reageren tegen (bijv. de KVK-controle wacht, of matching is tijdelijk beperkt): de echte reden
        !m.canApply &&
        m.blockReason && (
          <div className="card mb-6 border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
            {t.page.browseFirst} {translateBlockReason(m.blockReason, t)} {t.page.applyWhenDone}
          </div>
        )
      )}
      {m.newSinceLastVisit > 0 && (
        <p className="mb-4">
          <StatusPill tone="ok">{t.page.newCount(m.newSinceLastVisit)}</StatusPill>
        </p>
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
            <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">{t.page.noJobsBody}</p>
            {/* één actie: naar de meldingen. De knop zelf staat sinds 21 nov op Account (daar kent hij zijn stand op dit apparaat) */}
            <Link href="/dashboard/account" className="btn-primary mt-4 inline-flex">
              {t.eersteIndruk.meldingen.knop}
            </Link>
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
