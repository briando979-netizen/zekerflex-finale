import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UitloggenFormulier } from "@/components/app/UitloggenFormulier";
import { inDemoSessie, VOORBEELD_UITGANG } from "@/lib/auth/demo-sessie";
import { getUserCard, workerMissWhere } from "@/lib/profile/card";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { listMyReplacementRequests } from "@/lib/replacements/store";
import { PushToggle } from "@/components/app/PushToggle";
import { SpoedKanaalToggle } from "@/components/app/SpoedKanaalToggle";
import { ZiekMelden } from "@/components/app/ZiekMelden";
import { getTheme } from "@/lib/theme/server";
import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";
import { ThemeToggleRow } from "@/components/theme/ThemeToggle";
import { AccountLanguageRow } from "@/components/app/AccountLanguageRow";
import { inAndroidApp } from "@/lib/app-mode-server";
import { getFreelancerDict, getLocale } from "@/lib/i18n/server";
import { kennisbankIngesteld } from "@/lib/kennisbank/outline";
import { outlinePubliekeUrl } from "@/lib/oidc/aanbieder";
import { locatieTeksten } from "@/lib/locatie/teksten";
import { hulpTeksten } from "@/lib/hulp/teksten";
import { SUPPORT_CHAT } from "@/lib/hulp/hulpjes";
import { BANK_AAN } from "@/lib/app-mode";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { ProfielFotoKnop } from "@/components/app/ProfielFotoKnop";
import { PROFIELFOTO_TEKSTEN } from "@/lib/i18n/profielfoto";
import { basisLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

// Het Account van de werker in de opzet van de app van YoungOnes (21 nov 2026, eigenaar: "alles weg en in de stijl van
// YoungOnes, alleen de chat bewaren"; lees-uit in memory/youngones-app-20nov.md): de kop "ACCOUNT" staat in de balk
// bovenaan (FreelancerShell), dan één kaart met de ronde foto erbovenop, de naam groot, vijf sterren (grijs bij nul) en
// "0 beoordelingen", een lijn en "Jouw klussen over de laatste 6 maanden" met drie tellers; daaronder losse rijen met
// een chevron, in de volgorde van die app. Wat van ons echt bestaat (administratie, certificaten, passkeys, …) staat er
// als gewone rij tussen; de kaarten die geen functie waren (betrouwbaarheidsring, level, uitnodigen, beveiligingskaart)
// zijn weg. Sterren en tellers staan er altijd, ook op nul: zo doet die app het ook.

// vlag `publiek-alleen-flexwerk` (20 nov 2026, eigenaar): de losse diensten die niets met flexwerk te maken hebben
// (zakelijk nummer, wifi op locatie, portofoon, toegangscodes, kenteken) staan dan niet meer in dit menu; de pagina's blijven.
const NIET_FLEXWERK_ACCOUNT = new Set(["/dashboard/telefonie", "/dashboard/wifi", "/dashboard/portofoon", "/dashboard/toegangscodes", "/dashboard/voertuig"]);

type Item = { label: string; href: string; external?: boolean };

const KAART = "overflow-hidden rounded-2xl border border-hair bg-white shadow-card";

export default async function AccountPage() {
  const principal = await requirePrincipal();
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { id: true },
  });
  // in een voorbeeld (demo) wordt de uitlogknop een gewone uitgang-link (lib/auth/demo-sessie.ts)
  const demo = await inDemoSessie();

  const since = new Date();
  since.setMonth(since.getMonth() - 6);

  // Android app: no ZekerFlex Bank (lib/app-mode.ts)
  const inApp = await inAndroidApp();
  const ft = await getFreelancerDict();
  const t = ft.acct;
  // Op locatie (portofoon, toegangscodes, kenteken): eigen vijftalige teksten (lib/locatie/teksten.ts)
  const locale = await getLocale();
  const lt = locatieTeksten(locale).account;
  const [card, overview, fiscal, myReplacements, matched, notCompleted, theme] = await Promise.all([
    getUserCard(principal.userId),
    getFreelancerOverview(principal.userId),
    getFiscal(principal.userId),
    listMyReplacementRequests(principal.userId),
    profile
      ? prisma.shiftAssignment.count({
          where: { freelancerId: profile.id, acceptedAt: { gte: since } },
        })
      : Promise.resolve(0),
    // Alleen wat de werker zelf niet afmaakte: zelf afgezegd of niet opgekomen.
    // Een annulering door de opdrachtgever of een overdracht via "vervanging
    // regelen" telt niet (zie de cancelReason-teksten in de afzegroute en
    // lib/claims/no-show-sweep.ts).
    profile
      ? prisma.shiftAssignment.count({
          where: { freelancerId: profile.id, acceptedAt: { gte: since }, ...workerMissWhere },
        })
      : Promise.resolve(0),
    // dezelfde standaard als de werker-app zelf (app/dashboard/layout.tsx): zonder keuze is de app donker
    getTheme("dark"),
  ]);

  const isUitzend = invoiceModeFor(fiscal) === "payroll";
  const alleenFlexwerk = await alleenFlexwerkAan().catch(() => false);
  // Only a request that actually found a substitute counts as "arranged" — an
  // "open" (still pending) or "cancelled" (withdrawn, worked it yourself)
  // request never resulted in a real replacement.
  const replacementsArranged = myReplacements.filter(
    (r) => r.status === "resolved" && new Date(r.at) >= since,
  ).length;
  const reviews = card?.freelancer?.reviews ?? { average: 0, count: 0, distribution: {} as never };
  const stars = Math.round(reviews.average);
  // Een geplande (toekomstige) klus: het overzicht haalt die al op (lib/dashboard/freelancer.ts, kpis.upcoming).
  const heeftGeplandeKlus = overview.kpis.upcoming > 0;

  // De eerste rijen staan elk in een eigen kaart (zo staat het in die app), de rest in groepen.
  const BOVEN_ALLES: Item[] = [
    // "Ik heb een vraag": de chat met ZekerFlex (bij YoungOnes opent dit de service)
    { label: t.question, href: SUPPORT_CHAT },
    {
      label: t.feedback,
      href: "mailto:info@zekerflex.com?subject=Feedback%20ZekerFlex-app",
      external: true,
    },
  ];
  // hierna volgt de pushkaart (zie de JSX), dan de groepen
  const GROEPEN_ALLES: Item[][] = [
    [
      { label: t.favorites, href: "/dashboard/favorieten" },
      { label: t.hidden, href: "/dashboard/account/verborgen" },
      // "Introduceer een bedrijf" (17 nov 2026, lib/introducties); in de app zonder de beloning
      { label: ft.introductie.menu, href: "/dashboard/introduceren" },
    ],
    [
      { label: t.personal, href: "/dashboard/profiel" },
      { label: t.address, href: "/dashboard/profiel" },
      { label: t.experience, href: "/dashboard/profiel" },
      ...(isUitzend
        ? [
            { label: t.kindBsn, href: "/dashboard/fiscaal" },
            // de uitzendovereenkomst en loonstroken van ZekerFlex alleen als ZekerFlex zelf uitzender is (lib/uitzend/model.ts);
            // anders regelt het uitzendbureau dat
            ...(ZEKERFLEX_UITZENDER
              ? [
                  { label: t.uitzendContract, href: "/dashboard/verificatie" },
                  { label: t.payroll, href: "/dashboard/verloning" },
                ]
              : []),
          ]
        : [
            { label: t.business, href: "/dashboard/fiscaal" },
            { label: t.insurance, href: "/dashboard/verzekering" },
            { label: t.invoices, href: "/dashboard/uitbetalingen" },
            { label: t.mandate, href: "/dashboard/uitbetalingen" },
          ]),
      { label: t.certs, href: "/dashboard/certificaten" },
      { label: t.passport, href: "/dashboard/paspoort" },
      { label: t.availability, href: "/dashboard/beschikbaarheid" },
      { label: t.calendar, href: "/dashboard/agenda-koppeling" },
      { label: t.trips, href: "/dashboard/ritten" },
      { label: t.admin, href: "/dashboard/administratie" },
      { label: t.forecast, href: "/dashboard/vooruitblik" },
      { label: t.assistant, href: "/dashboard/assistent" },
      // ZekerFlex OS staat hier bewust niet: dat is geen flexwerk (de pagina /os zelf bestaat nog).
      ...(inApp || !BANK_AAN ? [] : [{ label: t.bank, href: "/dashboard/bank" }]),
      { label: t.workNumber, href: "/dashboard/telefonie" },
      { label: t.wifi, href: "/dashboard/wifi" },
      { label: lt.portofoon, href: "/dashboard/portofoon" },
      { label: lt.kluis, href: "/dashboard/toegangscodes" },
      { label: lt.voertuig, href: "/dashboard/voertuig" },
    ],
    [
      { label: t.email, href: "/dashboard/profiel" },
      { label: t.password, href: "/wachtwoord-vergeten" },
      // tweestapsverificatie is weg (21 nov 2026, eigenaar; lib/auth/tweestap-aan.ts): een passkey is de extra beveiliging
      { label: t.passkey, href: "/dashboard/account/passkeys" },
      { label: t.download, href: "/api/me/gegevens/export", external: true },
      { label: t.privacy, href: "/privacy" },
      { label: t.delete, href: "/dashboard/account/verwijderen" },
    ],
    [
      // het hulpcentrum voor werkers (lib/hulp/teksten.ts), in de taal van de werker; dezelfde plek als het vraagteken in de kopbalk
      { label: hulpTeksten(locale).titel, href: "/dashboard/hulp" },
      { label: t.kb, href: "/kennis" },
      // de handleidingen (Outline, lib/kennisbank): inloggen gaat met het ZekerFlex-account
      ...(kennisbankIngesteld() ? [{ label: t.manuals, href: `${outlinePubliekeUrl()}/`, external: true }] : []),
      // 22 nov 2026: de community op de site zelf (lib/community), niet meer de nieuwsbrief
      { label: t.community, href: "/community" },
    ],
  ];
  // met de vlag aan vallen de niet-flexwerk-diensten uit het menu (de pagina's zelf blijven bereikbaar)
  const zonderNietFlexwerk = (items: Item[]) => (alleenFlexwerk ? items.filter((i) => !NIET_FLEXWERK_ACCOUNT.has(i.href)) : items);
  const BOVEN = zonderNietFlexwerk(BOVEN_ALLES);
  const GROEPEN = GROEPEN_ALLES.map(zonderNietFlexwerk);

  return (
    <>
      {/* Profile header: de ronde foto steekt boven de kaart uit, zoals in de app van YoungOnes */}
      <section className="relative mt-14 rounded-2xl border border-hair bg-white px-5 pb-6 pt-16 text-center shadow-card">
        <div className="absolute -top-12 left-1/2 grid h-24 w-24 -translate-x-1/2 place-items-center overflow-hidden rounded-full border border-hair bg-paper-soft">
          {/* tik op de foto: Foto maken, Kiezen uit bibliotheek, Verwijderen, Annuleren (zoals YoungOnes, 21 nov) */}
          <ProfielFotoKnop userId={principal.userId} fotoUrl={card?.avatarUrl ?? null} teksten={PROFIELFOTO_TEKSTEN[basisLocale(locale)]} />
        </div>
        <p className="font-display text-2xl font-bold text-ink">{card?.name ?? principal.email}</p>

        {/* vijf sterren, altijd: grijs zolang er geen beoordeling is (neutralx-400 haalt de 3:1 voor beeldelementen) */}
        <div className="mt-2 flex items-center justify-center gap-1 text-2xl leading-none text-amber-500" aria-hidden>
          {"★★★★★".slice(0, stars)}
          <span className="text-neutralx-400">{"★★★★★".slice(stars)}</span>
        </div>
        <Link
          href="/dashboard/beoordelingen"
          className="mt-2 inline-block text-base font-semibold text-neutralx-500 underline underline-offset-4"
        >
          {t.reviews(reviews.count)}
        </Link>

        <div className="mt-6 border-t border-hair pt-5">
          <p className="text-base text-ink">{t.statsTitle}</p>
          <div className="mt-4 grid grid-cols-3 divide-x divide-hair">
            <Stat value={matched} label={t.matched} />
            <Stat value={notCompleted} label={t.notCompleted} />
            <Stat value={replacementsArranged} label={t.replaced} />
          </div>
        </div>
      </section>

      {/* ziek melden blijft alleen weg bij wie nog nooit een klus aannam: "gepland" telt alleen klussen die nog moeten
          beginnen, dus wie tijdens een lopende klus ziek wordt, vindt de kaart via de aangenomen klussen van het laatste
          halfjaar (beide getallen zijn hierboven al opgehaald, geen extra vraag aan de database) */}
      {/* ziek melden bij ZekerFlex als werkgever; bij een uitzendbureau meld je je ziek bij het bureau (lib/uitzend/model.ts) */}
      {isUitzend && ZEKERFLEX_UITZENDER && (heeftGeplandeKlus || matched > 0) && (
        <div className="mt-4">
          <ZiekMelden texts={ft.accountDelen.ziek} />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {BOVEN.map((it) => (
          <div key={it.label} className={KAART}>
            <Row item={it} />
          </div>
        ))}

        {/* Pushmeldingen: de kaart zelf (aan/uit, testmelding), met daaronder sms/WhatsApp bij spoedoproepen */}
        <PushToggle cardTexts={ft.accountDelen.push} />
        <div className={KAART}>
          <SpoedKanaalToggle />
        </div>

        {GROEPEN.map((items, gi) => (
          <div key={gi} className={KAART}>
            {items.map((it) => (
              <Row key={it.label} item={it} />
            ))}
          </div>
        ))}

        <div className={KAART}>
          <ThemeToggleRow theme={theme} texts={ft.accountDelen.thema} />
        </div>

        <div className={KAART}>
          <AccountLanguageRow />
        </div>

        <UitloggenFormulier className={KAART} {...(demo ? { demoUitgang: VOORBEELD_UITGANG } : {})}>
          <button
            type="submit"
            className="flex min-h-[56px] w-full items-center justify-between gap-3 px-5 py-4 text-left text-base font-medium text-crit hover:bg-crit/5"
          >
            {t.logout}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M16 17l5-5-5-5M21 12H9M12 19H6a2 2 0 01-2-2V7a2 2 0 012-2h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </UitloggenFormulier>
      </div>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-2">
      <p className="font-display text-3xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-sm leading-snug text-neutralx-500">{label}</p>
    </div>
  );
}

function Row({ item }: { item: Item }) {
  const chevron = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-neutralx-400" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const cls =
    "flex min-h-[56px] items-center justify-between gap-3 border-b border-hair px-5 py-4 text-base font-medium text-ink last:border-b-0 hover:bg-paper-soft";

  if (item.external) {
    return (
      <a href={item.href} className={cls}>
        {item.label}
        {chevron}
      </a>
    );
  }
  return (
    <Link href={item.href} className={cls}>
      {item.label}
      {chevron}
    </Link>
  );
}
