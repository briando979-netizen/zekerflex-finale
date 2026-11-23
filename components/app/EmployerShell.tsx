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
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { Theme } from "@/lib/theme/config";
import { naamInitialen } from "@/lib/naam/initialen";

// ---------------------------------------------------------------------------
// Employer workspace shell — its own chrome (org name + rating in the topbar,
// language switch, help, a collapsible icon rail). The freelancer AppShell is
// left untouched.
//
// 23 nov 2026 (eigenaar: het dashboard moet er net zo uitzien en zo zijn ingedeeld als dat van YoungOnes, in onze eigen
// huisstijl): een smalle donkere zijbalk met alleen pictogrammen, die uitklapt naar pictogrammen met namen; een dunne witte
// kopbalk; een lichte, effen achtergrond; de inhoud in één gecentreerde kolom met een vaste breedte. Op een laptop staat de
// zijbalk standaard ingeklapt (de keuze wordt onthouden); op een telefoon is het een lade achter de menuknop, altijd met namen.
// De zijbalk is in het lichte én het donkere thema donker (eigen kleuren: ink en het diepe groen), dus daar staan geen
// klassen die het thema omkleurt. De kaarten en knoppen van de werkgeversapp krijgen hun vorm via data-app="werkgever"
// (app/globals.css). Het menu zelf (welke regels, in welke volgorde) komt nog altijd van menuVoor().
// ---------------------------------------------------------------------------

/** een regel in de zijbalk: minstens 44 px hoog; de naam is op een laptop alleen voor een schermlezer als de zijbalk is ingeklapt */
const railRij = "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors";

/** een regel in het gebruikersmenu rechtsboven: minstens 44 px hoog om te tikken */
const menuRij = "flex min-h-11 items-center rounded-lg px-3 text-sm text-ink hover:bg-paper-soft";

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="13" height="13" viewBox="0 0 24 24" className={n <= Math.round(value) ? "text-amber-400" : "text-neutralx-300"}>
          <path
            fill="currentColor"
            d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"
          />
        </svg>
      ))}
    </span>
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
  const current = nav.find((n) => isActive(n.href));

  const groups: { section: string | null; items: NavItem[] }[] = [];
  for (const item of nav) {
    const key = item.section ?? null;
    const last = groups[groups.length - 1];
    if (last && last.section === key) last.items.push(item);
    else groups.push({ section: key, items: [item] });
  }

  return (
    <div
      data-theme={theme}
      data-app="werkgever"
      className={`app-scope min-h-screen bg-paper-soft lg:grid ${
        // minmax(0,1fr): anders groeit de inhoudskolom mee met een lange rij tabbladen (horeca, rijschool)
        // en wordt de hele pagina breder dan het scherm
        collapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[256px_minmax(0,1fr)]"
      }`}
    >
      {/* Sidebar: donker in beide thema's. Op een telefoon een lade (altijd met namen), op een laptop blijft hij in beeld staan. */}
      <aside
        id="employer-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] transform flex-col bg-gradient-to-b from-ink via-brand-700 to-ink text-white transition-all duration-300 ease-spring lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          collapsed ? "lg:w-[72px]" : "lg:w-[256px]"
        } ${open ? "translate-x-0 shadow-e3" : "-translate-x-full"}`}
      >
        <div className={`flex h-16 flex-shrink-0 items-center gap-2.5 px-5 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
          <LogoGlyph size={28} tone="light" />
          <p className={`font-display text-sm font-bold text-white ${collapsed ? "lg:hidden" : ""}`}>ZekerFlex</p>
        </div>

        {/* in- en uitklappen (alleen op een laptop): ingeklapt blijven de pictogrammen staan, met de naam als tooltip */}
        <button
          type="button"
          onClick={toggleCollapse}
          aria-expanded={!collapsed}
          aria-controls="employer-sidebar"
          aria-label={collapsed ? t.shell.expand : t.shell.collapse}
          title={collapsed ? t.shell.expand : undefined}
          className={`mx-3 hidden min-h-11 flex-shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:flex ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <span className={`grid h-9 w-9 flex-shrink-0 place-items-center transition-transform ${collapsed ? "" : "rotate-180"}`} aria-hidden>
            <RailToggleGlyph />
          </span>
          {!collapsed && t.shell.collapse}
        </button>
        <div className="mx-3 mt-2 flex-shrink-0 border-t border-white/20" aria-hidden />

        <nav aria-label="Hoofdnavigatie" className="flex-1 space-y-3 overflow-y-auto p-3">
          {groups.map((g, gi) => (
            <div key={gi} className="space-y-1">
              {g.section && (
                <p className={`px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/60 ${collapsed ? "lg:hidden" : ""}`}>
                  {g.section}
                </p>
              )}
              {g.section && collapsed && gi > 0 && <div className="mx-3 my-2 hidden border-t border-white/20 lg:block" />}
              {g.items.map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    title={collapsed ? n.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`${railRij} ${collapsed ? "lg:justify-center lg:px-0" : ""} ${
                      active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-mint" />}
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center">{n.icon}</span>
                    <span className={collapsed ? "lg:sr-only" : ""}>{n.label}</span>
                    {n.badge ? <span className={collapsed ? "ml-auto lg:absolute lg:right-1 lg:top-1 lg:ml-0" : "ml-auto"}>{n.badge}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex-shrink-0 border-t border-white/20 p-3">
          {/* ZekerFlex OS: elk scherm als app op één bureaublad (de naam is in elke taal gelijk) */}
          {/* Een gewone link (geen <Link>): /os moet als eigen document laden, anders houdt de pagina de CSP van dit scherm (geen frame-src 'self') en blijft elk app-venster leeg. target=_top: vanuit een OS-venster zelf geen OS in de OS. */}
          {toonOs && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- volledige paginalading nodig voor de CSP van /os
          <a
            href="/os"
            target="_top"
            onClick={() => setOpen(false)}
            title={collapsed ? "ZekerFlex OS" : undefined}
            className={`${railRij} text-brand-mint hover:bg-white/10 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <rect x="1" y="1" width="6" height="6" rx="1.5" />
                <rect x="9" y="1" width="6" height="6" rx="1.5" />
                <rect x="1" y="9" width="6" height="6" rx="1.5" />
                <rect x="9" y="9" width="6" height="6" rx="1.5" />
              </svg>
            </span>
            <span className={collapsed ? "lg:sr-only" : ""}>ZekerFlex OS</span>
          </a>
          )}
          {/* Instellingen staat er voor elk bedrijf (eigenaar, 23 nov 2026: zoals bij YoungOnes), onderaan de zijbalk als laatste ingang.
              De stip (amber = wacht op jou) verdwijnt zodra het bedrijfsprofiel af is. `relative`: de sr-only tekst blijft in deze regel. */}
          <Link
            href={settingsHref}
            onClick={() => setOpen(false)}
            title={collapsed ? t.shell.settings : undefined}
            aria-current={isActive(settingsHref) ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors min-h-11 ${
              collapsed ? "lg:justify-center lg:px-0" : ""
            } ${isActive(settingsHref) ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
          >
            {isActive(settingsHref) && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-mint" />}
            <span className="relative grid h-9 w-9 flex-shrink-0 place-items-center">
              <SettingsGlyph />
              {profielOnvolledig && <span aria-hidden className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-warn" />}
            </span>
            <span className={collapsed ? "lg:sr-only" : ""}>{t.shell.settings}</span>
            {profielOnvolledig && <span className="sr-only"> ({t.shell.profileIncomplete})</span>}
          </Link>
          <form {...(demoUitgang ? { action: demoUitgang, method: "get" as const } : { action: logoutAction })}>
            <button
              title={collapsed ? t.shell.logout : undefined}
              className={`${railRij} w-full text-left text-white/70 hover:bg-white/10 hover:text-white ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center">
                <LogoutGlyph />
              </span>
              <span className={collapsed ? "lg:sr-only" : ""}>{t.shell.logout}</span>
            </button>
          </form>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      {/* Main */}
      <div className="flex min-h-screen min-w-0 flex-col bg-paper-soft">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-hair bg-white px-4 lg:px-8">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong lg:hidden"
            aria-label={open ? "Sluit navigatiemenu" : "Open navigatiemenu"}
            aria-expanded={open}
            aria-controls="employer-sidebar"
          >
            ☰
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate font-display text-sm font-bold text-ink">{orgName}</span>
            {/* zonder beoordelingen geen vijf grijze sterren met "(0 …)": pas tonen vanaf de eerste */}
            {rating && rating.count > 0 && (
              <Link
                href="/werkgever/reviews"
                className="hidden items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-paper-soft sm:flex"
                title={t.shell.reviewsTitle}
              >
                <Stars value={rating.average} />
                <span className="text-xs text-brand-600 underline-offset-2 hover:underline">
                  {fmt(rating.count === 1 ? t.shell.reviewsCountOne : t.shell.reviewsCount, {
                    avg: rating.average.toFixed(1),
                    n: rating.count,
                  })}
                </span>
              </Link>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <label className="hidden items-center rounded-lg border border-hairstrong bg-white px-2 py-1.5 text-xs text-neutralx-600 sm:flex">
              <span className="mr-1.5" aria-hidden>
                🌐
              </span>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                className="bg-transparent pr-1 outline-none"
                aria-label={t.shell.language}
              >
                {EMPLOYER_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>

            <ThemeToggle
              theme={theme}
              className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:border-brand-400 hover:text-brand-600"
            />

            {hulp ? (
              <HulpCentrum t={hulp} soort="bedrijf" handleidingen={handleidingen} />
            ) : (
              <Link
                href={helpHref}
                className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:border-brand-400 hover:text-brand-600"
                aria-label={t.shell.help}
                title={t.shell.help}
              >
                ?
              </Link>
            )}

            {/* de bel van het bedrijf: alleen bedrijfsmeldingen, met tabbladen voor een bedrijf (Diensten, Uren & facturen) */}
            <NotificationsBell app="werkgever" texts={locale === "en" ? NOTIFICATIONS_BEDRIJF.en : NOTIFICATIONS_BEDRIJF.nl} />
            <PushSelfHeal />

            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenu((v) => !v)}
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
                <span className="hidden max-w-[9rem] truncate sm:inline">{userName}</span>
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

        <main id="main" tabIndex={-1} key={pathname} className="relative flex-1 animate-slide-up-fade px-4 py-8 outline-none lg:px-8 lg:py-10">
          {/* één gecentreerde kolom met een vaste breedte, op elk scherm */}
          <div className="mx-auto max-w-6xl">
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 4v16M10 12h9m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

function LogoutGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 12H5m10 0-3-3m3 3-3 3M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
