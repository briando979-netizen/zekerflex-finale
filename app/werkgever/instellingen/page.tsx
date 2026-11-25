import Link from "next/link";
import type { ReactNode } from "react";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { heeftOmslagfoto } from "@/lib/werkgever/bedrijfsprofiel";
import { getDict } from "@/lib/i18n/server";
import { PushToggle } from "@/components/app/PushToggle";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { Kaart } from "@/components/werkgever/Kaart";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import {
  IUser,
  IUsers,
  IMail,
  IPin,
  IHash,
  IKey,
  IDoc,
  IGrid,
  IHeart,
  IList,
  IActivity,
  IBell,
} from "@/components/app/icons";

export const dynamic = "force-dynamic";

interface Card {
  title: string;
  sub: string;
  href?: string;
  icon: ReactNode;
  soon?: boolean;
  /** een gewone link (download of mail), geen pagina van de app: zonder Link, zodat er niets wordt voorgeladen */
  gewoon?: boolean;
  /** een kleine stip bij het pictogram: wacht op jou (amber), zoals de rode stip bij YoungOnes */
  stip?: boolean;
  /** de woorden voor een schermlezer bij de stip */
  stipTekst?: string;
}

export default async function InstellingenPage() {
  const principal = await requirePrincipal();
  const d = await getDict();
  const s = d.settings;
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const extra = tenantId ? await getOrgProfileExtra(tenantId) : {};
  // dezelfde regel als de stip bij Instellingen in de zijbalk (lib/werkgever/bedrijfsprofiel.ts)
  const hasCover = heeftOmslagfoto(extra);
  // vlag `publiek-alleen-flexwerk`: de API-koppelingen (het ontwikkelaarsportaal is verborgen) niet meer als kaart
  const alleenFlexwerk = await alleenFlexwerkAan().catch(() => false);

  // Elke kaart wijst naar de plek waar je het ook echt doet (23 nov 2026, eigenaar: "exact overnemen wat YoungOnes heeft"). Waar een eigen
  // pagina nog niet bestaat, wijst de kaart naar het dichtstbijzijnde scherm en staat dat hieronder:
  //  - Contactinformatie: de contactpersoon bij een klus is nu de vestigingsmanager of een beheerder (lib/messaging/contacts.ts), dus
  //    /werkgever/team. Wacht op ronde 2 (C6): een eigen lijst contactpersonen op /werkgever/instellingen/contactpersonen.
  //  - Verwerkersovereenkomst: de openbare tekst /verwerkersovereenkomst. Wacht op ronde 2 (C4): versies, ondertekenen en downloaden.
  //  - Notificaties: de mailvoorkeuren onderaan Bedrijfsprofiel (#notificaties). Wacht op ronde 2 (B3/C8): een eigen pagina met
  //    een schakelaar per gebeurtenis.
  //  - Factuurgegevens: het blok "Meer instellingen voor je boekhouding" op Facturen (#factuurgegevens klapt het open). Wacht op
  //    ronde 2 (C2): een eigen pagina met tenaamstelling, t.a.v., KVK en btw.
  const bedrijf: Card[] = [
    { title: s.cProfileT, sub: s.cProfileS, href: "/werkgever/bedrijf", icon: <IUser />, ...(hasCover ? {} : { stip: true, stipTekst: d.shell.profileIncomplete }) },
    { title: s.cReviewsT, sub: s.cReviewsS, href: "/werkgever/reviews", icon: <IActivity /> },
    { title: s.cContactT, sub: s.cContactS, href: "/werkgever/team", icon: <IMail /> },
    { title: s.cLocationsT, sub: s.cLocationsS, href: "/werkgever/locaties", icon: <IPin /> },
    { title: s.cCostT, sub: s.cCostS, href: "/werkgever/instellingen/kostenplaatsen", icon: <IHash /> },
    { title: s.cUsersT, sub: s.cUsersS, href: "/werkgever/team", icon: <IUsers /> },
    ...(alleenFlexwerk ? [] : [{ title: s.cApiT, sub: s.cApiS, href: "/werkgever/integraties", icon: <IKey /> }]),
    // de openbare tekst staat buiten de app: een gewone link, zonder voorladen
    { title: s.cDpaT, sub: s.cDpaS, href: "/verwerkersovereenkomst", icon: <IDoc />, gewoon: true },
  ];

  const klussen: Card[] = [
    { title: s.cTemplatesT, sub: s.cTemplatesS, href: "/werkgever/templates", icon: <IGrid /> },
    { title: s.cLabelsT, sub: s.cLabelsS, href: "/werkgever/favorieten/pools", icon: <IHeart /> },
    { title: s.cShiftSettingsT, sub: s.cShiftSettingsS, href: "/werkgever/instellingen/klussen", icon: <IList /> },
    { title: s.cNotifT, sub: s.cNotifS, href: "/werkgever/bedrijf#notificaties", icon: <IBell /> },
  ];

  // met de vlag aan is er geen abonnement meer te kiezen (prijs per gewerkt uur): de kaart valt weg, de pagina blijft bereikbaar
  const facturatie: Card[] = [
    { title: s.cInvoiceT, sub: s.cInvoiceS, href: "/werkgever/facturen#factuurgegevens", icon: <IDoc /> },
    ...(alleenFlexwerk ? [] : [{ title: "Abonnement en uitbreidingen", sub: "Wat je nu hebt en wat je erbij kunt nemen", href: "/werkgever/abonnement", icon: <IGrid /> }]),
  ];

  // 15 nov 2026: dezelfde onderdelen als de werkersapp (privacy, feedback), maar zonder export en delete (net als YoungOnes)
  const account: Card[] = [
    { title: s.cAccountT, sub: s.cAccountS, href: "/werkgever/account", icon: <IUser /> },
    // "Introduceer een bedrijf" (17 nov 2026, lib/introducties): een ander bedrijf aan ZekerFlex voorstellen; met de vlag aan niet
    ...(alleenFlexwerk ? [] : [{ title: d.introductie.menu, sub: d.introductie.kaartSub, href: "/werkgever/introduceren", icon: <IUsers /> }]),
    { title: s.cPrivacyT, sub: s.cPrivacyS, href: "/privacy", icon: <IKey /> },
    { title: s.cFeedbackT, sub: s.cFeedbackS, href: "mailto:info@zekerflex.com?subject=Feedback%20ZekerFlex%20zakelijk", icon: <IMail />, gewoon: true },
  ];

  return (
    <>
      {/* de ene kop van de werkgeversapp; het overzicht zelf heeft geen link terug */}
      <PaginaKop title={s.title} />

      {/* de oproep bovenaan zolang er geen omslagfoto is: tekst en knop links, rechts een rustig vak met een belletje (amber = wacht op jou) */}
      {!hasCover && (
        <Kaart className="mb-10">
          <div className="flex items-start justify-between gap-6 sm:p-4">
            <div className="max-w-2xl">
              <h2 className="font-display text-lg font-bold leading-snug text-ink">{s.coverTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-neutralx-600">{s.coverBody}</p>
              <Link href="/werkgever/bedrijf" className="btn-primary mt-6 inline-flex min-h-11">
                {s.coverCta}
              </Link>
            </div>
            <span className="hidden h-20 w-20 flex-shrink-0 place-items-center rounded-lg bg-paper-soft text-warn sm:grid">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 16V10a6 6 0 1 1 12 0v6l2 2H4l2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
          </div>
        </Kaart>
      )}

      <Section title={s.sectionCompany} cards={bedrijf} soonLabel={d.common.soon} />
      <Section title={s.sectionShifts} cards={klussen} soonLabel={d.common.soon} />
      <Section title={s.sectionInvoicing} cards={facturatie} soonLabel={d.common.soon} />
      <Section title={s.sectionAccount} cards={account} soonLabel={d.common.soon} />
      <div className="-mt-4 mb-10 max-w-xl">
        <PushToggle />
      </div>
    </>
  );
}

// Eén groep kaarten: een dunne lijn, de naam van de groep in rustig grijs, en de kaarten in een raster (vier naast elkaar op een
// brede laptop, drie op een smalle, twee op een tablet, één op een telefoon). Een kaart = pictogram in een grijs vakje, de titel
// vet en één regel uitleg. De hele kaart is de link, dus het tikdoel is ruim 44 px.
function Section({ title, cards, soonLabel }: { title: string; cards: Card[]; soonLabel: string }) {
  return (
    <section className="mb-10 border-t border-hairstrong pt-6">
      <h2 className="mb-4 text-sm text-neutralx-500">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((c) => {
          const inner = (
            <>
              <span className="relative grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-paper-soft text-brand-600">
                {c.icon}
                {c.stip && <span aria-hidden className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-warn" />}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="break-words text-sm font-bold leading-snug text-ink">{c.title}</span>
                  {c.stip && c.stipTekst && <span className="sr-only"> ({c.stipTekst})</span>}
                  {c.soon && (
                    <span className="rounded-full bg-paper-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutralx-500">
                      {soonLabel}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-neutralx-600">{c.sub}</span>
              </span>
            </>
          );
          const cls = "relative flex min-h-[4.5rem] items-start gap-3 rounded-lg border border-hair bg-white p-3 shadow-e1 transition-colors";
          return c.href && !c.soon && c.gewoon ? (
            <a key={c.title} href={c.href} className={`${cls} hover:border-brand-300`}>
              {inner}
            </a>
          ) : c.href && !c.soon ? (
            <Link key={c.title} href={c.href} className={`${cls} hover:border-brand-300`}>
              {inner}
            </Link>
          ) : (
            <div key={c.title} className={`${cls} cursor-default opacity-70`}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
