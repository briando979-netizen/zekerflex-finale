"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { LogoGlyph } from "@/components/brand/Logo";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { NOTIFICATIONS_BEDRIJF } from "@/components/app/notifications-texts";
import { PushSelfHeal } from "@/components/app/PushToggle";
import { HulpCentrum } from "@/components/app/HulpCentrum";
import type { HulpTeksten } from "@/lib/hulp/hulpjes";
import { RecentResponseAlert } from "@/components/app/RecentResponseAlert";
import type { NavItem } from "@/components/app/AppShell";
import { useT, setLocale } from "@/components/i18n/I18nProvider";
import { EMPLOYER_LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/dictionaries";
import { ThemeToggle, ThemeToggleRow } from "@/components/theme/ThemeToggle";
import type { Theme } from "@/lib/theme/config";
import { THEMA_EN, THEMA_NL } from "@/lib/account/teksten";
import { naamInitialen } from "@/lib/naam/initialen";
import { perSectie, splitsMenu } from "@/lib/werkgever/menu-groepen";
import { SCHIL_INHOUD, SCHIL_KOPBALK, SCHIL_RASTER_IN, SCHIL_RASTER_UIT, SCHIL_ZIJBALK_IN, SCHIL_ZIJBALK_UIT } from "@/components/werkgever/bouwstenen";

// ---------------------------------------------------------------------------
// Employer workspace shell — its own chrome (org name + rating in the topbar,
// language switch, help, a collapsible icon rail). The freelancer AppShell is
// left untouched.
//
// 23 nov 2026 (eigenaar: het dashboard moet er net zo uitzien en zo zijn ingedeeld als dat van YoungOnes, in onze eigen
// huisstijl): een smalle donkere zijbalk met alleen pictogrammen, die uitklapt naar pictogrammen met namen; een witte
// kopbalk; een lichte, effen achtergrond. Op een laptop staat de zijbalk standaard ingeklapt (de keuze wordt onthouden); op
// een telefoon is het een lade achter de menuknop, altijd met namen.
// Ronde 2 (zelfde dag, na het meten naast de referentie): de zijbalk is 94 px ingeklapt en 221 px uitgeklapt, de kopbalk
// 78 px hoog met een zachte schaduw in plaats van een rand, en de inhoud staat links uitgelijnd op 32 px van de zijbalk met
// een maximale breedte van 1192 px (de maten staan in components/werkgever/bouwstenen.ts). De zijbalk heeft twee groepen:
// de hoofdregels met Instellingen erachter, en een rustiger tweede groep (lib/werkgever/menu-groepen.ts). Uitloggen staat
// alleen nog in het gebruikersmenu rechtsboven.
// De zijbalk is in het lichte én het donkere thema donker (eigen kleuren: ink en het diepe groen), dus daar staan geen
// klassen die het thema omkleurt. De kaarten en knoppen van de werkgeversapp krijgen hun vorm via data-app="werkgever"
// (app/globals.css). Het menu zelf (welke regels, in welke volgorde) komt nog altijd van menuVoor().
// ---------------------------------------------------------------------------

/**
 * een regel in de zijbalk: 48 px hoog, 12 px van de rand, het pictogram op een vaste plek (23 px van links) zodat het niet
 * verspringt bij in- en uitklappen. `relative`: de naam is op een laptop alleen voor een schermlezer als de zijbalk is ingeklapt.
 */
const railRij = "group relative mx-3 flex min-h-12 items-center gap-2 rounded-md pl-[23px] pr-3 text-sm transition-colors";
/** een regel in de tweede groep: iets lager (nog altijd 44 px om te tikken) en met een kleiner pictogram */
const railRijRustig = "group relative mx-3 flex min-h-11 items-center gap-2 rounded-md pl-[23px] pr-3 text-[13px] transition-colors";
/** het vak van een pictogram: altijd 24 px breed; het pictogram zelf is 24 px (hoofdregel) of 20 px (tweede groep) */
const railIcoon = "relative grid h-6 w-6 flex-shrink-0 place-items-center [&>svg]:h-6 [&>svg]:w-6";
const railIcoonRustig = "relative grid h-6 w-6 flex-shrink-0 place-items-center [&>svg]:h-5 [&>svg]:w-5";

/** een regel in het gebruikersmenu rechtsboven: minstens 44 px hoog om te tikken */
const menuRij = "flex min-h-11 items-center rounded-lg px-3 text-sm text-ink hover:bg-paper-soft";

/** een vierkante knop in de kopbalk */
const kopKnop = "grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:border-brand-400 hover:text-brand-600";

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="16" height="16" viewBox="0 0 24 24" className={n <= Math.round(value) ? "text-amber-400" : "text-neutralx-300"}>
          <path
            fill="currentColor"
            d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"
          />
        </svg>
      ))}
    </span>
  );
}

/** Eén regel van de zijbalk. Een losse component (niet binnen de schil gedefinieerd), zodat hij bij elke weergave dezelfde blijft. */
function RailLink({
  item,
  active,
  collapsed,
  rustig = false,
  stip = false,
  stipTekst,
  onKies,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  /** de tweede groep: kleiner en lichter */
  rustig?: boolean;
  /** een kleine stip op het pictogram (amber = wacht op jou) */
  stip?: boolean;
  /** wat de stip betekent, voor een schermlezer */
  stipTekst?: string | undefined;
  onKies: () => void;
}) {
  const rust = rustig ? "text-white/65 hover:bg-white/10 hover:text-white" : "text-white/85 hover:bg-white/15 hover:text-white";
  return (
    <Link
      href={item.href}
      onClick={onKies}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`${rustig ? railRijRustig : railRij} ${active ? "bg-white/15 text-white" : rust}`}
    >
      <span className={rustig ? railIcoonRustig : railIcoon}>
        {item.icon}
        {stip && <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warn" />}
      </span>
      <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
      {stip && stipTekst ? <span className="sr-only"> ({stipTekst})</span> : null}
      {item.badge ? <span className={collapsed ? "ml-auto lg:absolute lg:right-1 lg:top-1 lg:ml-0" : "ml-auto"}>{item.badge}</span> : null}
    </Link>
  );
}

export function EmployerShell({
  nav,
  locale,
  theme,
  orgName,
  rating,
  userName,
  userMeta,
  avatarUrl,
  canSwitchToFreelancer = false,
  helpHref = "/kennis/werkgevers",
  hulp,
  handleidingen = null,
  settingsHref = "/werkgever/instellingen",
  demoUitgang,
  toonOs = true,
  profielOnvolledig = false,
  children,
}: {
  /** de ingang "ZekerFlex OS" onderin de zijbalk; met de vlag `publiek-alleen-flexwerk` aan alleen voor een platformbeheerder (20 nov) */
  toonOs?: boolean;
  /**
   * een kleine stip bij "Instellingen" zolang het bedrijfsprofiel niet af is (lib/werkgever/bedrijfsprofiel.ts), zoals de rode stip bij
   * YoungOnes. De regel "Instellingen" zelf staat er voor elk bedrijf: het besluit van 20 nov (met de vlag `publiek-alleen-flexwerk` weg,
   * "één plek voor bedrijfsgegevens") is op 23 nov 2026 teruggedraaid door de eigenaar, die Instellingen wil zoals bij YoungOnes.
   */
  profielOnvolledig?: boolean;
  nav: NavItem[];
  locale: Locale;
  theme: Theme;
  orgName: string;
  /** de beoordelingen van het bedrijf; null = wij hebben die gegevens niet (dan geen sterren) */
  rating: { average: number; count: number } | null;
  userName: string;
  userMeta: string;
  canSwitchToFreelancer?: boolean;
  /** Eigen profielfoto — toont in de gebruikersknop i.p.v. de initialen. */
  avatarUrl?: string | null;
  helpHref?: string;
  /** het hulpcentrum voor bedrijven achter het vraagteken (lib/hulp/werkgever-teksten.ts); zonder staat er de oude link naar de kennispagina */
  hulp?: HulpTeksten;
  /** adres van de handleidingen (Outline); null = niet ingesteld */
  handleidingen?: string | null;
  settingsHref?: string;
  /** In een voorbeeld (demo) wordt de uitlogknop een gewone link hiernaartoe: een GET verlaat
   *  de demo, terwijl uitloggen (een POST) in de alleen-lezen demo op 423 vastloopt. */
  demoUitgang?: string;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [userMenu, setUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("zf-emp-collapsed") !== "0");
    } catch {
      /* ignore */
    }
  }, []);

  // Touch devices (iPad) have no hover, so onMouseLeave never fires to close
  // the menu — close on any tap/click outside it instead.
  useEffect(() => {
    if (!userMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [userMenu]);

  function toggleCollapse() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("zf-emp-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const isActive = (href: string) => {
    return pathname === href || (href !== "/werkgever" && pathname.startsWith(href + "/")) ||
      (href === "/werkgever" && pathname === "/werkgever");
  };
  const sluitLade = () => setOpen(false);

  // de hoofdregels (met Instellingen erachter) en de rustiger tweede groep; er valt niets weg (lib/werkgever/menu-groepen.ts)
  const { hoofd, rest } = splitsMenu(nav);
  const restGroepen = perSectie(rest);
  const instellingen: NavItem = { href: settingsHref, label: t.shell.settings, icon: <SettingsGlyph /> };

  return (
    <div
      data-theme={theme}
      data-app="werkgever"
      className={`app-scope min-h-screen bg-paper-soft lg:grid ${
        // minmax(0,1fr): anders groeit de inhoudskolom mee met een lange rij tabbladen
        // en wordt de hele pagina breder dan het scherm
        collapsed ? SCHIL_RASTER_IN : SCHIL_RASTER_UIT
      }`}
    >
      {/* Sidebar: donker in beide thema's. Op een telefoon een lade (altijd met namen), op een laptop blijft hij in beeld staan. */}
      <aside
        id="employer-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] transform flex-col bg-gradient-to-b from-ink via-brand-700 to-ink text-white transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          collapsed ? SCHIL_ZIJBALK_IN : SCHIL_ZIJBALK_UIT
        } ${open ? "translate-x-0 shadow-e3" : "-translate-x-full"}`}
      >
        {/* het logo staat op dezelfde plek, ingeklapt en uitgeklapt (31 px van links = het midden van 94 px) */}
        <div className="flex h-16 flex-shrink-0 items-center gap-2.5 pl-[31px] pr-3 lg:h-[78px]">
          <LogoGlyph size={32} tone="light" />
          <p className={`font-display text-base font-bold text-white ${collapsed ? "lg:hidden" : ""}`}>ZekerFlex</p>
        </div>

        {/* in- en uitklappen (alleen op een laptop): ingeklapt blijven de pictogrammen staan, met de naam als tooltip */}
        <button
          type="button"
          onClick={toggleCollapse}
          aria-expanded={!collapsed}
          aria-controls="employer-sidebar"
          aria-label={collapsed ? t.shell.expand : t.shell.collapse}
          title={collapsed ? t.shell.expand : undefined}
          className="mx-3 hidden min-h-12 flex-shrink-0 items-center gap-2 rounded-md pl-[23px] pr-3 text-sm text-white/85 transition-colors hover:bg-white/15 hover:text-white lg:flex"
        >
          <span className={`grid h-6 w-6 flex-shrink-0 place-items-center transition-transform ${collapsed ? "" : "rotate-180"}`} aria-hidden>
            <RailToggleGlyph />
          </span>
          {!collapsed && t.shell.collapse}
        </button>
        <div className="mx-3 mt-2 flex-shrink-0 border-t border-white/20" aria-hidden />

        <nav aria-label="Hoofdnavigatie" className="flex-1 overflow-y-auto py-4">
          {/* de hoofdregels, met Instellingen als laatste (eigenaar, 23 nov 2026: zoals bij YoungOnes). De stip (amber = wacht op jou)
              verdwijnt zodra het bedrijfsprofiel af is. */}
          <div className="space-y-2">
            {hoofd.map((n) => (
              <RailLink key={n.href} item={n} active={isActive(n.href)} collapsed={collapsed} onKies={sluitLade} />
            ))}
            <RailLink
              item={instellingen}
              active={isActive(settingsHref)}
              collapsed={collapsed}
              stip={profielOnvolledig}
              stipTekst={t.shell.profileIncomplete}
              onKies={sluitLade}
            />
          </div>

          {/* de tweede groep: rustiger (kleiner, lichter), met een kopje per blok als de zijbalk is uitgeklapt */}
          {rest.length > 0 && <div className="mx-3 my-4 border-t border-white/20" aria-hidden />}
          {restGroepen.map((g, gi) => (
            <div key={gi} className="space-y-0.5">
              {g.section && (
                <p className={`px-[35px] pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/60 ${collapsed ? "lg:hidden" : ""}`}>
                  {g.section}
                </p>
              )}
              {g.section && collapsed && gi > 0 && <div className="mx-3 my-2 hidden border-t border-white/20 lg:block" />}
              {g.items.map((n) => (
                <RailLink key={n.href} item={n} active={isActive(n.href)} collapsed={collapsed} rustig onKies={sluitLade} />
              ))}
            </div>
          ))}
        </nav>

        {/* ZekerFlex OS: elk scherm als app op één bureaublad (de naam is in elke taal gelijk) */}
        {/* Een gewone link (geen <Link>): /os moet als eigen document laden, anders houdt de pagina de CSP van dit scherm (geen frame-src 'self') en blijft elk app-venster leeg. target=_top: vanuit een OS-venster zelf geen OS in de OS. */}
        {toonOs && (
          <div className="flex-shrink-0 border-t border-white/20 py-3">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- volledige paginalading nodig voor de CSP van /os */}
            <a href="/os" target="_top" onClick={sluitLade} title={collapsed ? "ZekerFlex OS" : undefined} className={`${railRijRustig} text-brand-mint hover:bg-white/10`}>
              <span className={railIcoonRustig}>
                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <rect x="1" y="1" width="6" height="6" rx="1.5" />
                  <rect x="9" y="1" width="6" height="6" rx="1.5" />
                  <rect x="1" y="9" width="6" height="6" rx="1.5" />
                  <rect x="9" y="9" width="6" height="6" rx="1.5" />
                </svg>
              </span>
              <span className={collapsed ? "lg:sr-only" : ""}>ZekerFlex OS</span>
            </a>
          </div>
        )}
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      {/* Main */}
      <div className="flex min-h-screen min-w-0 flex-col bg-paper-soft">
        {/* de kopbalk: wit, 78 px hoog op een laptop, met een zachte schaduw in plaats van een rand (.wg-kop in app/globals.css) */}
        <header className={`wg-kop sticky top-0 z-20 flex items-center gap-3 bg-white px-4 lg:px-8 ${SCHIL_KOPBALK}`}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg border border-hairstrong text-ink lg:hidden"
            aria-label={open ? "Sluit navigatiemenu" : "Open navigatiemenu"}
            aria-expanded={open}
            aria-controls="employer-sidebar"
          >
            <MenuGlyph />
          </button>

          {/* links: de bedrijfsnaam met de sterren en het aantal beoordelingen (de link gaat naar de beoordelingen van het bedrijf).
              Op een telefoon vallen de sterren weg en krijgt de naam de ruimte, over twee regels als het moet. */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="line-clamp-2 min-w-0 break-words font-display text-sm font-bold leading-tight text-ink sm:line-clamp-1">{orgName}</span>
            {/* zoals de referentie (ronde 2, 23 nov 2026): ook zonder beoordelingen staan de vijf lege sterren er, met "(0 beoordelingen)".
                Zonder gegevens (geen bedrijf gekoppeld) staat er niets. */}
            {rating && (
              <Link
                href="/werkgever/reviews"
                className="hidden min-h-11 flex-shrink-0 items-center gap-2 rounded-md px-1 hover:bg-paper-soft sm:flex"
                title={t.shell.reviewsTitle}
              >
                <Stars value={rating.count > 0 ? rating.average : 0} />
                <span className="hidden text-xs font-semibold text-brand-600 underline-offset-2 hover:underline lg:inline">
                  {rating.count > 0
                    ? `(${fmt(rating.count === 1 ? t.shell.reviewsCountOne : t.shell.reviewsCount, { avg: rating.average.toFixed(1), n: rating.count })})`
                    : t.shell.reviewsZero}
                </span>
              </Link>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {/* de taalkeuze: even hoog als de knoppen ernaast */}
            <label className="hidden h-11 items-center rounded-lg border border-hairstrong bg-white pl-3 pr-2 text-sm text-neutralx-600 sm:flex">
              <span className="mr-2" aria-hidden>
                🌐
              </span>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                className="h-full bg-transparent pr-1 outline-none"
                aria-label={t.shell.language}
              >
                {EMPLOYER_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>

            {/* op een telefoon staan de weergave en de hulp niet in de kopbalk (de bedrijfsnaam heeft de ruimte nodig): de weergave
                staat dan in het gebruikersmenu, het hulpcentrum in de lade */}
            <ThemeToggle theme={theme} className={`${kopKnop} hidden sm:grid`} texts={locale === "en" ? THEMA_EN : THEMA_NL} />

            <div className="hidden sm:block">
              {hulp ? (
                <HulpCentrum t={hulp} soort="bedrijf" handleidingen={handleidingen} />
              ) : (
                <Link href={helpHref} className={kopKnop} aria-label={t.shell.help} title={t.shell.help}>
                  ?
                </Link>
              )}
            </div>

            {/* de bel van het bedrijf: alleen bedrijfsmeldingen, met tabbladen voor een bedrijf (Diensten, Uren & facturen) */}
            <NotificationsBell app="werkgever" texts={locale === "en" ? NOTIFICATIONS_BEDRIJF.en : NOTIFICATIONS_BEDRIJF.nl} />
            <PushSelfHeal />

            <div ref={userMenuRef} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setUserMenu((v) => !v)}
                aria-expanded={userMenu}
                aria-haspopup="menu"
                className="flex min-h-11 items-center gap-2 rounded-lg border border-hairstrong bg-white px-2.5 py-1.5 text-sm font-medium text-ink"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-semibold text-white">
                    {naamInitialen(userName)}
                  </span>
                )}
                {/* de naam staat erbij zodra er ruimte is (vanaf 1280 px); daaronder gaat de ruimte naar de bedrijfsnaam en de sterren */}
                <span className="hidden max-w-[9rem] truncate xl:inline">{userName}</span>
                <span className="text-neutralx-400" aria-hidden>
                  ▾
                </span>
              </button>
              {userMenu && (
                <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-hair bg-white p-1.5 shadow-lift">
                  <p className="truncate px-3 py-1.5 text-xs text-neutralx-400">{userMeta}</p>
                  {/* zoals bij YoungOnes (23 nov 2026): Persoonlijke instellingen, Notificatievoorkeuren en Uitloggen. Instellingen en
                      Bedrijfsprofiel staan altijd in de zijbalk; de mailvoorkeuren staan op de bedrijfspagina (anker #notificaties). */}
                  <Link href="/werkgever/account" onClick={() => setUserMenu(false)} className={menuRij}>
                    {t.shell.menuPersonal}
                  </Link>
                  <Link href="/werkgever/bedrijf#notificaties" onClick={() => setUserMenu(false)} className={menuRij}>
                    {t.shell.menuNotifications}
                  </Link>
                  {canSwitchToFreelancer && (
                    <Link href="/dashboard/klussen" onClick={() => setUserMenu(false)} className={menuRij}>
                      {t.shell.menuWorkerWorkspace}
                    </Link>
                  )}
                  <Link href="/" onClick={() => setUserMenu(false)} className={menuRij}>
                    {t.common.naarWebsite}
                  </Link>
                  {/* alleen op een telefoon: de lichte of donkere weergave (op een laptop staat die knop in de kopbalk) */}
                  <div className="overflow-hidden rounded-lg sm:hidden">
                    <ThemeToggleRow theme={theme} texts={locale === "en" ? THEMA_EN : THEMA_NL} />
                  </div>
                  <form {...(demoUitgang ? { action: demoUitgang, method: "get" as const } : { action: logoutAction })}>
                    <button className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-crit hover:bg-crit/5">
                      {t.shell.logout}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} key={pathname} className="relative flex-1 animate-slide-up-fade px-4 py-8 outline-none lg:px-8 lg:py-12">
          {/* de inhoud staat links uitgelijnd, op 32 px van de zijbalk, met een maximale breedte (geen gat meer links en rechts) */}
          <div className={SCHIL_INHOUD}>
            {children}
          </div>
        </main>
      </div>

      <RecentResponseAlert />
    </div>
  );
}

/** een streep met een pijl naar rechts (uitklappen); de knop draait hem om voor inklappen */
function RailToggleGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 4v16M10 12h9m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** drie strepen: de menuknop op een telefoon */
function MenuGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19 12c0-.5 0-.9-.1-1.3l1.9-1.4-2-3.4-2.2 1a6.8 6.8 0 0 0-2.2-1.3L12 2.5 9.6 4.3a6.8 6.8 0 0 0-2.2 1.3l-2.2-1-2 3.4L5 10.7c-.1.4-.1.8-.1 1.3s0 .9.1 1.3l-1.9 1.4 2 3.4 2.2-1c.6.5 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.6-.8 2.2-1.3l2.2 1 2-3.4-1.9-1.4c.1-.4.1-.8.1-1.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
