"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { ACCOUNT_ONDERDELEN, initialen, isAccountPad, studioAccountAdres, type AccountOnderdeel } from "@/lib/studio/account";
import { DashboardWisselaar, type DashboardStand } from "@/components/app/werkruimte/DashboardWisselaar";
import { StudioProvider, useStudio } from "@/components/studio/context";
import WebshopStart from "@/components/studio/WebshopStart";
import { IBuilding, ICalendar, ICard, ICoins, IDoc, IExternal, IGrid, IHome, ILayout, ILogout, IMail, IMenu, IPalette, IPercent, IPin, IReceipt, ISparkle, ITeam, ITrend, ISettings, IStore, ITag, ITruck, IUser, IUsers, IX, Pill, btn } from "@/components/studio/ui";
import { isPaginaBouwer } from "@/lib/sites/paginabouwer";
import type { SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// De studio heeft twee aparte werkruimtes: /studio/website (Website bouwen) en
// /studio/webshop (Webshop openen), elk een eigen dashboard met een eigen zijmenu
// en eigen topbalk. Boven: titel, de knop naar de andere (als het bedrijf die
// heeft), "Bekijk" en Publiceren; links: de wisselaar naar de andere dashboards
// van het bedrijf (lib/werkgever/werkruimte.ts), de onderdelen en het account (bedrijf,
// facturen, team, mail, mijn account: lib/studio/account.ts, alles binnen de studio, niets in
// het werkgeversdashboard); rechtsboven de accountknop; op de telefoon klapt het menu uit.
// Gegevens: components/studio/context.tsx (per soort een eigen site).
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const WEBSITE = "/studio/website";
const WEBSHOP = "/studio/webshop";

const NAV: Record<SiteSoort, { hoofd: NavItem[]; extra?: { kop: string; items: NavItem[] } }> = {
  website: {
    hoofd: [
      { href: WEBSITE, label: "Overzicht", icon: <IHome /> },
      { href: `${WEBSITE}/bouwer`, label: "Bouwer", icon: <ILayout /> },
      { href: `${WEBSITE}/ontwerpen`, label: "Ontwerpen", icon: <IGrid /> },
      { href: `${WEBSITE}/ontwerp`, label: "Ontwerp", icon: <IPalette /> },
      { href: `${WEBSITE}/reserveringen`, label: "Reserveringen", icon: <ICalendar /> },
      { href: `${WEBSITE}/instellingen`, label: "Instellingen", icon: <ISettings /> },
    ],
  },
  webshop: {
    hoofd: [
      { href: WEBSHOP, label: "Overzicht", icon: <IHome /> },
      { href: `${WEBSHOP}/producten`, label: "Producten", icon: <ITag /> },
      { href: `${WEBSHOP}/bestellingen`, label: "Bestellingen", icon: <IReceipt /> },
      { href: `${WEBSHOP}/klanten`, label: "Klanten", icon: <IUsers /> },
      { href: `${WEBSHOP}/kortingen`, label: "Kortingen", icon: <IPercent /> },
      { href: `${WEBSHOP}/verzending`, label: "Verzending", icon: <ITruck /> },
      { href: `${WEBSHOP}/betalen`, label: "Betalen", icon: <ICard /> },
      { href: `${WEBSHOP}/slim`, label: "Slim", icon: <ISparkle /> },
      { href: `${WEBSHOP}/groei`, label: "Groei", icon: <ITrend /> },
      { href: `${WEBSHOP}/kassa`, label: "Op locatie", icon: <IPin /> },
      { href: `${WEBSHOP}/paginas`, label: "Pagina's", icon: <ILayout /> },
      { href: `${WEBSHOP}/ontwerpen`, label: "Ontwerpen", icon: <IGrid /> },
      { href: `${WEBSHOP}/ontwerp`, label: "Ontwerp", icon: <IPalette /> },
      { href: `${WEBSHOP}/instellingen`, label: "Instellingen", icon: <ISettings /> },
    ],
    extra: {
      kop: "ZekerFlex-shop",
      items: [
        { href: `${WEBSHOP}/verkopen`, label: "Verkopen op ZekerFlex", icon: <IStore /> },
        { href: `${WEBSHOP}/verdienen`, label: "Verdienen", icon: <ICoins /> },
      ],
    },
  },
};

// Deze onderdelen werken ook zonder eigen site (de ZekerFlex-shop, de bouwer die de site zelf maakt,
// en de ontwerpen: daar kies je er een om mee te beginnen).
const ZONDER_SITE: Record<SiteSoort, string[]> = {
  website: [`${WEBSITE}/bouwer`, `${WEBSITE}/ontwerpen`],
  webshop: [`${WEBSHOP}/verkopen`, `${WEBSHOP}/verdienen`, `${WEBSHOP}/ontwerpen`],
};

const TITEL: Record<SiteSoort, string> = { website: "Website", webshop: "Webshop" };

const isActive = (path: string, href: string) => (href === WEBSITE || href === WEBSHOP ? path === href : path === href || path.startsWith(`${href}/`));

// Het account, binnen de studio (eigenaar 11 nov: "apart, niet in het dashboard van een werkgever").
const ACCOUNT_ICOON: Record<AccountOnderdeel, ReactNode> = {
  bedrijf: <IBuilding />,
  facturen: <IDoc />,
  team: <ITeam />,
  mail: <IMail />,
  account: <IUser />,
};

export interface StudioGebruiker {
  naam: string;
  email: string;
}

/** `dashboards`: de stand van de wisselaar (lib/sites/studio-stand.ts); null = geen wisselaar. `gebruiker`: voor de accountknop. */
export function StudioShell({ soort, dashboards, gebruiker = null, children }: { soort: SiteSoort; dashboards: (DashboardStand & { cookieGoed?: boolean }) | null; gebruiker?: StudioGebruiker | null; children: ReactNode }) {
  return (
    <StudioProvider soort={soort}>
      <Shell dashboards={dashboards} gebruiker={gebruiker}>{children}</Shell>
    </StudioProvider>
  );
}

function Shell({ dashboards, gebruiker, children }: { dashboards: (DashboardStand & { cookieGoed?: boolean }) | null; gebruiker: StudioGebruiker | null; children: ReactNode }) {
  const { soort, base } = useStudio();
  const path = usePathname() ?? base;
  // Rechtstreeks in de studio (bladwijzer, link): dan ook dit dashboard openzetten, zodat
  // Facturen, Mail en /werkgever daarna het menu van de website of webshop tonen.
  const zetOpen = dashboards !== null && dashboards.cookieGoed === false;
  useEffect(() => {
    if (!zetOpen) return;
    void fetch("/api/werkgever/dashboard/wissel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soort }),
    }).catch(() => undefined);
  }, [zetOpen, soort]);
  // het telefoonmenu hoort bij één pagina: na een klik op een onderdeel is het vanzelf dicht
  const [menuOp, setMenuOp] = useState<string | null>(null);
  const menu = menuOp === path;
  // de paginabouwer (Website → Bouwer, Webshop → Pagina's) heeft de volle breedte nodig
  const wide = isPaginaBouwer(path);
  return (
    <div className="min-h-dvh bg-[#f1f1f1] text-[#303030]">
      <TopBar onMenu={() => setMenuOp((m) => (m === path ? null : path))} menu={menu} dashboards={dashboards} gebruiker={gebruiker} />
      <div className="flex">
        {/* een div, geen aside: de nav erin is het (benoemde) landmark. Vanaf md scrolt alleen de nav,
            zodat het menu van de wisselaar (breder dan de balk) over de pagina kan vallen */}
        <div className={`${menu ? "fixed inset-x-0 top-14 z-30 block max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-[#e3e3e3] shadow-lg" : "hidden"} w-full bg-[#ebebeb] md:sticky md:top-14 md:z-20 md:flex md:h-[calc(100dvh-3.5rem)] md:w-60 md:flex-shrink-0 md:flex-col md:overflow-visible md:border-0 md:shadow-none`}>
          <SideNav path={path} soort={soort} dashboards={dashboards} />
        </div>
        <main id="studio-inhoud" className={`min-w-0 flex-1 px-4 py-6 sm:px-6 ${wide ? "" : "lg:px-10"}`}>
          <div className={wide ? "" : "mx-auto max-w-[1100px]"}>
            <Body path={path}>{children}</Body>
          </div>
        </main>
      </div>
    </div>
  );
}

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

function TopBar({ onMenu, menu, dashboards, gebruiker }: { onMenu: () => void; menu: boolean; dashboards: DashboardStand | null; gebruiker: StudioGebruiker | null }) {
  const { data, unpublished, publish, soort } = useStudio();
  const inBouwer = isPaginaBouwer(usePathname() ?? "");
  const [busy, setBusy] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; text: string } | null>(null);
  const site = data?.site;
  const live = Boolean(site?.liveBuild);
  const ander: SiteSoort = soort === "webshop" ? "website" : "webshop";
  // alleen als het bedrijf dat dashboard al heeft; toevoegen gaat via de wisselaar
  const naarAnder = dashboards?.dashboards.includes(ander) ?? false;
  const doPublish = async () => {
    setBusy(true);
    const fout = await publish();
    setBusy(false);
    setMelding(fout ? { ok: false, text: fout } : { ok: true, text: soort === "webshop" ? "Je webshop is bijgewerkt." : "Je website is bijgewerkt." });
    setTimeout(() => setMelding(null), 4000);
  };
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 bg-[#1a1a1a] px-3 text-white sm:gap-3 sm:px-4">
      <button type="button" onClick={onMenu} aria-expanded={menu} aria-label={menu ? "Menu sluiten" : "Menu openen"} className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10 md:hidden ${focus}`}>
        {menu ? <IX /> : <IMenu />}
      </button>
      <Link href="/studio" aria-label="Alle ZekerFlex Sites" className={`flex items-center gap-2 rounded-lg font-semibold tracking-tight ${focus}`}>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-sm font-black text-[#1a1a1a]">Z</span>
        <span className="hidden sm:inline">{TITEL[soort]}</span>
      </Link>
      {naarAnder && (
        <Link href={`/studio/${ander}`} className={`rounded-lg border border-white/25 px-2.5 py-1 text-xs font-semibold text-white/90 hover:bg-white/10 ${focus}`}>
          <span className="sm:hidden">{TITEL[ander]}</span>
          <span className="hidden sm:inline">Naar {TITEL[ander].toLowerCase()}</span>
        </Link>
      )}
      {site && <span className="hidden min-w-0 truncate text-sm text-white/70 lg:inline">· {site.bedrijf.naam}</span>}
      <div className="ml-auto flex items-center gap-2">
        {melding && (
          <span role={melding.ok ? "status" : "alert"} className={`hidden rounded-lg px-2 py-1 text-xs font-semibold sm:inline ${melding.ok ? "bg-[#cdfed4] text-[#014b1a]" : "bg-[#fed1d7] text-[#8e0b21]"}`}>
            {melding.text}
          </span>
        )}
        {site && (live ? <Pill tone="ok">Online</Pill> : <Pill tone="warn">Concept</Pill>)}
        {site && live && data?.address && (
          <a href={data.address} target="_blank" rel="noopener" className={`hidden items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-white/90 hover:bg-white/10 sm:inline-flex ${focus}`}>
            Bekijk {soort === "webshop" ? "webshop" : "website"} <IExternal width={15} height={15} />
          </a>
        )}
        {/* in de paginabouwer (website en webshop) zit een eigen publiceerknop */}
        {site && data?.canPublish && !inBouwer && (
          <button type="button" disabled={busy || (!unpublished && live)} onClick={() => void doPublish()} className={`rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-[#1a1a1a] hover:bg-white/90 disabled:opacity-40 ${focus}`}>
            {busy ? "Bezig…" : live ? (unpublished ? "Wijzigingen publiceren" : "Gepubliceerd") : "Publiceren"}
          </button>
        )}
        {gebruiker && <AccountKnop gebruiker={gebruiker} soort={soort} />}
      </div>
    </header>
  );
}

/** Rechtsboven: wie er is ingelogd, het account en uitloggen. */
function AccountKnop({ gebruiker, soort }: { gebruiker: StudioGebruiker; soort: SiteSoort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  // dicht bij een klik ernaast, met Escape, en na het wisselen van pagina
  useEffect(() => {
    if (!open) return;
    const klik = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", toets);
    };
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  const item = "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-[#303030] hover:bg-[#f1f1f1]";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account van ${gebruiker.naam}`}
        className={`grid h-8 w-8 place-items-center rounded-full bg-white/15 text-xs font-bold text-white hover:bg-white/25 ${focus}`}
      >
        {initialen(gebruiker.naam)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-64 rounded-2xl border border-[#e3e3e3] bg-white p-1.5 text-[#303030] shadow-[0_12px_32px_-12px_rgba(0,0,0,.35)]">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold text-[#1a1a1a]">{gebruiker.naam}</p>
            <p className="truncate text-xs text-[#707070]">{gebruiker.email}</p>
          </div>
          <div className="border-t border-[#ebebeb] pt-1">
            {ACCOUNT_ONDERDELEN.map((o) => (
              <Link key={o.pad} role="menuitem" href={studioAccountAdres(soort, o.pad)} className={item}>
                <span className="text-[#616161]">{ACCOUNT_ICOON[o.pad]}</span>
                {o.label}
              </Link>
            ))}
          </div>
          <form action={logoutAction} className="mt-1 border-t border-[#ebebeb] pt-1">
            <button type="submit" role="menuitem" className={`${item} w-full text-[#b42318] hover:bg-[#fff5f5]`}>
              <ILogout />
              Uitloggen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function NavLink({ n, path, badge }: { n: NavItem; path: string; badge?: number }) {
  const on = isActive(path, n.href);
  return (
    <li>
      <Link
        href={n.href}
        aria-current={on ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a1a] ${on ? "bg-white text-[#1a1a1a] shadow-[0_1px_0_rgba(0,0,0,.08)]" : "text-[#4a4a4a] hover:bg-white/60"}`}
      >
        <span className={on ? "text-[#1a1a1a]" : "text-[#616161]"}>{n.icon}</span>
        <span className="flex-1">{n.label}</span>
        {badge ? <span className="rounded-full bg-[#1a1a1a] px-1.5 text-[11px] font-bold text-white">{badge}<span className="sr-only"> nieuw</span></span> : null}
      </Link>
    </li>
  );
}

function SideNav({ path, soort, dashboards }: { path: string; soort: SiteSoort; dashboards: DashboardStand | null }) {
  const { data, api } = useStudio();
  const [nieuw, setNieuw] = useState(0);
  const heeftSite = Boolean(data?.site);
  const shop = soort === "webshop";
  useEffect(() => {
    if (!heeftSite || !shop) return;
    // het aantal nieuwe bestellingen naast "Bestellingen"
    void fetch("/api/werkgever/sites/bestellingen", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bestellingen: { status: string }[] } | null) => setNieuw(d?.bestellingen.filter((b) => b.status === "nieuw").length ?? 0))
      .catch(() => undefined);
  }, [heeftSite, shop, path, api]);
  const nav = NAV[soort];
  return (
    <>
      {/* bovenaan, net als in de werkgever-app: het menu van de wisselaar klapt naar beneden open */}
      {dashboards && (
        <div className="px-2 pt-2">
          <DashboardWisselaar stand={dashboards} donker />
        </div>
      )}
      <nav aria-label={shop ? "Webshop" : "Website"} className="flex min-h-0 flex-1 flex-col p-2 md:overflow-y-auto">
        <ul className="space-y-0.5">
          {nav.hoofd.map((n) => (
            <NavLink key={n.href} n={n} path={path} {...(n.href === `${WEBSHOP}/bestellingen` ? { badge: nieuw } : {})} />
          ))}
        </ul>
        {nav.extra && (
          <>
            <p className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#707070]">{nav.extra.kop}</p>
            <ul className="space-y-0.5">
              {nav.extra.items.map((n) => (
                <NavLink key={n.href} n={n} path={path} />
              ))}
            </ul>
          </>
        )}
        {/* het account: in de studio zelf, niet in het werkgeversdashboard (lib/studio/account.ts) */}
        <div className="mt-auto border-t border-black/10 pt-3">
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#707070]">Account</p>
          <ul className="space-y-0.5">
            {ACCOUNT_ONDERDELEN.map((o) => (
              <NavLink key={o.pad} n={{ href: studioAccountAdres(soort, o.pad), label: o.label, icon: ACCOUNT_ICOON[o.pad] }} path={path} />
            ))}
          </ul>
        </div>
      </nav>
    </>
  );
}

/** Zonder eigen site eerst de start (de webshop-start of de bouwer); verder de pagina zelf. */
function Body({ path, children }: { path: string; children: ReactNode }) {
  const { data, error, soort, base } = useStudio();
  // het account werkt ook zonder site, en wacht niet op de gegevens van de site
  if (isAccountPad(path)) return <>{children}</>;
  if (error) return <p role="alert" className="rounded-2xl bg-[#fed1d7] p-5 text-sm text-[#8e0b21]">{error}</p>;
  if (!data) return <div className="space-y-3" aria-busy="true" aria-label="Laden"><div className="h-10 w-48 animate-pulse rounded-xl bg-white/70" /><div className="h-48 animate-pulse rounded-2xl bg-white/70" /></div>;
  if (!data.site && !ZONDER_SITE[soort].some((p) => path.startsWith(p))) {
    if (soort === "webshop") return <WebshopStart />;
    return (
      <section className="overflow-hidden rounded-3xl bg-[#1a1a1a] px-6 py-14 text-center text-white sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Website bouwen</p>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Je eigen website, in een paar minuten</h1>
        <p className="mx-auto mt-3 max-w-xl text-white/75">Kies een ontwerp voor je branche en controleer je gegevens. Daarna pas je teksten, foto&apos;s en stijl aan en zet je hem online.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={`${base}/bouwer`} className={`${btn.secondary} border-0`}>Begin met je website</Link>
          <Link href={`${base}/ontwerpen`} className="inline-flex items-center rounded-xl border border-white/30 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10">Bekijk eerst de ontwerpen</Link>
        </div>
      </section>
    );
  }
  return <>{children}</>;
}
