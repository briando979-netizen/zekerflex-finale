"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { locateAdminPage, visibleHubs, type AdminHub, type HubIcon } from "@/lib/admin/nav";
import { ViewAsSwitcher } from "@/components/admin/ViewAsControls";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { PushSelfHeal } from "@/components/app/PushToggle";
import { LogoGlyph } from "@/components/brand/Logo";
import { IGrid, IUsers, IWallet, IRocket, IChat, IPulse, IShield, IBriefcase } from "@/components/app/icons";

const THEME_KEY = "zf-admin-theme";
const COLLAPSE_KEY = "zf-admin-collapsed";

const HUB_ICONS: Record<HubIcon, ReactNode> = {
  overview: <IGrid />,
  people: <IUsers />,
  money: <IWallet />,
  growth: <IRocket />,
  chat: <IChat />,
  shop: <IBriefcase />,
  ai: <IPulse />,
  shield: <IShield />,
};

export function AdminShell({
  userName,
  userMeta,
  avatarUrl,
  limited = false,
  children,
}: {
  userName: string;
  userMeta: string;
  /** Eigen profielfoto — toont in de gebruikersknop i.p.v. de initialen. */
  avatarUrl?: string | null;
  /** Geen platformbeheerder: alleen wat deze rol hier mag zien. */
  limited?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const located = locateAdminPage(pathname);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // null = volg de actieve pagina; anders heeft de gebruiker zelf iets open of dicht gezet.
  const [openHub, setOpenHub] = useState<string | null>(null);
  // Wat per onderdeel om aandacht vraagt: open disputen, mislukte betalingen, open AI-bevindingen.
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (limited) return;
    let alive = true;
    const load = () =>
      fetch("/api/admin/overview", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((o: { queues?: { openDisputes?: number; failedPayments?: number; openFindings?: number } } | null) => {
          if (!alive || !o?.queues) return;
          setBadges({ veiligheid: o.queues.openDisputes ?? 0, geld: o.queues.failedPayments ?? 0, ai: o.queues.openFindings ?? 0 });
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [limited]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* geen opgeslagen voorkeur */
    }
  }, []);
  useEffect(() => {
    setMobileOpen(false);
    setOpenHub(null);
  }, [pathname]);

  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch { /* geen opslag */ }
      return next;
    });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* geen opslag */ }
      return !c;
    });

  const hubs = visibleHubs(limited);
  const activeHub = located?.hub.id ?? hubs[0]?.id ?? "";
  const shownHub = openHub ?? activeHub;

  return (
    <div className="admin-scope min-h-screen" data-theme={theme}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Naar hoofdinhoud
      </a>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}

      {/* Zijmenu */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-[width,transform] duration-200 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "lg:w-[4.25rem]" : "lg:w-[15.5rem]"} w-[17rem]`}
        style={{ background: "var(--a-side-bg)", color: "var(--a-side-text)" }}
      >
        <div className={`flex h-14 flex-shrink-0 items-center gap-2.5 px-4 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
          <Link href={hubs[0]?.pages[0]?.href ?? "/admin"} className="flex min-w-0 items-center gap-2.5" aria-label="Naar de startpagina van beheer">
            <LogoGlyph size={28} tone="light" className="flex-shrink-0" />
            <span className={`truncate text-[0.9375rem] font-semibold tracking-tight text-white ${collapsed ? "lg:hidden" : ""}`}>ZekerFlex</span>
          </Link>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${collapsed ? "lg:hidden" : ""}`} style={{ background: "var(--a-side-hover)", color: "var(--a-side-mute)" }}>
            Beheer
          </span>
        </div>

        <nav aria-label="Hoofdnavigatie" className="a-scroll-x flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4 pt-1">
          {hubs.map((hub) => (
            <HubLink
              key={hub.id}
              hub={hub}
              badge={badges[hub.id] ?? 0}
              active={hub.id === activeHub}
              open={!collapsed && hub.id === shownHub}
              collapsed={collapsed}
              pathname={pathname}
              onToggle={() => setOpenHub((cur) => ((cur ?? activeHub) === hub.id ? "" : hub.id))}
            />
          ))}
        </nav>

        <div className="flex-shrink-0 space-y-0.5 px-2.5 py-2.5" style={{ borderTop: "1px solid var(--a-side-line)" }}>
          {/* ZekerFlex OS: elk scherm als app op één bureaublad */}
          {/* Een gewone link (geen <Link>): /os moet als eigen document laden, anders houdt de pagina de CSP van dit scherm (geen frame-src 'self') en blijft elk app-venster leeg. target=_top: vanuit een OS-venster zelf geen OS in de OS. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- volledige paginalading nodig voor de CSP van /os */}
          <a
            href="/os"
            target="_top"
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[0.8125rem] font-semibold transition-colors hover:bg-[var(--a-side-hover)] ${collapsed ? "lg:justify-center" : ""}`}
            style={{ color: "var(--a-accent)" }}
            title={collapsed ? "ZekerFlex OS" : undefined}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden className="flex-shrink-0">
              <rect x="1" y="1" width="6" height="6" rx="1.5" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" />
            </svg>
            <span className={collapsed ? "lg:hidden" : ""}>ZekerFlex OS</span>
          </a>
          <Link
            href="/"
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[0.8125rem] transition-colors hover:bg-[var(--a-side-hover)] ${collapsed ? "lg:justify-center" : ""}`}
            style={{ color: "var(--a-side-mute)" }}
            title={collapsed ? "Naar de website" : undefined}
          >
            <GlobeIcon />
            <span className={collapsed ? "lg:hidden" : ""}>Naar de website</span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={`hidden w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[0.8125rem] transition-colors hover:bg-[var(--a-side-hover)] lg:flex ${collapsed ? "lg:justify-center" : ""}`}
            style={{ color: "var(--a-side-mute)" }}
            aria-label={collapsed ? "Menu uitklappen" : "Menu inklappen"}
            title={collapsed ? "Menu uitklappen" : undefined}
          >
            <CollapseIcon flipped={collapsed} />
            <span className={collapsed ? "lg:hidden" : ""}>Inklappen</span>
          </button>
        </div>
      </aside>

      {/* Inhoud */}
      <div className={`flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 ${collapsed ? "lg:pl-[4.25rem]" : "lg:pl-[15.5rem]"}`}>
        <header
          className="sticky top-0 z-30 backdrop-blur-md"
          style={{ background: "color-mix(in srgb, var(--a-page) 86%, transparent)" }}
        >
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:px-7">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg lg:hidden"
              style={{ color: "var(--a-dim)" }}
              aria-label="Menu openen"
            >
              <BarsIcon />
            </button>
            <nav aria-label="Kruimelpad" className="flex min-w-0 items-center gap-1.5 text-[0.8125rem]">
              <span className="hidden truncate sm:inline" style={{ color: "var(--a-mute)" }}>{located?.hub.label ?? "Beheer"}</span>
              <span className="hidden sm:inline" style={{ color: "var(--a-axis)" }} aria-hidden>/</span>
              <span className="truncate font-medium" style={{ color: "var(--a-text)" }}>{located?.page.label ?? "Beheer"}</span>
            </nav>

            <button
              type="button"
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="ml-auto hidden h-9 w-full max-w-[17rem] items-center gap-2 rounded-lg px-3 text-[0.8125rem] transition-colors md:flex"
              style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-mute)", boxShadow: "var(--a-shadow-sm)" }}
            >
              <SearchIcon />
              <span>Zoeken of vraag Jarvis</span>
              <kbd className="ml-auto rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold" style={{ background: "var(--a-elev)", color: "var(--a-mute)" }}>⌘K</kbd>
            </button>

            <div className="ml-auto flex flex-shrink-0 items-center gap-1 md:ml-1">
              {!limited && <ViewAsSwitcher />}
              <IconButton onClick={toggleTheme} label={theme === "dark" ? "Licht thema" : "Donker thema"}>
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </IconButton>
              <NotificationsBell />
              <PushSelfHeal />
              <UserMenu userName={userName} userMeta={userMeta} avatarUrl={avatarUrl ?? null} />
            </div>
          </div>
          {located && !limited && located.hub.pages.length > 1 && <SectionTabs hub={located.hub} current={located.page.href} />}
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1500px] flex-1 px-3 pb-14 pt-5 outline-none sm:px-5 lg:px-7 lg:pt-6">
          <div key={pathname} className="animate-slide-up-fade">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Een onderdeel in het zijmenu. De naam gaat naar de eerste pagina, het pijltje klapt alleen uit. */
function HubLink({
  hub,
  badge,
  active,
  open,
  collapsed,
  pathname,
  onToggle,
}: {
  hub: AdminHub;
  /** Aantal dat om aandacht vraagt; 0 = niets tonen. */
  badge: number;
  active: boolean;
  open: boolean;
  collapsed: boolean;
  pathname: string;
  onToggle: () => void;
}) {
  return (
    <div>
      <div
        className={`group relative flex items-center rounded-lg transition-colors ${active ? "" : "hover:bg-[var(--a-side-hover)]"}`}
        style={active ? { background: "var(--a-side-active)" } : undefined}
      >
        <Link
          href={hub.pages[0]!.href}
          title={collapsed ? hub.label : undefined}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-[0.8125rem] ${collapsed ? "lg:justify-center" : ""}`}
          style={{ color: active ? "#ffffff" : "var(--a-side-text)", fontWeight: active ? 600 : 500 }}
        >
          <span className="relative flex-shrink-0" style={{ color: active ? "rgb(var(--brand-mint-rgb))" : "var(--a-side-mute)" }}>
            {HUB_ICONS[hub.icon]}
            {badge > 0 && collapsed && <span className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full lg:block" style={{ background: "var(--a-warn)" }} aria-hidden />}
          </span>
          <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{hub.label}</span>
          {badge > 0 && (
            <span className={`num ml-auto rounded-full px-1.5 text-[0.6875rem] font-semibold ${collapsed ? "lg:hidden" : ""}`} style={{ background: "var(--a-warn)", color: "#1a1204" }} aria-label={`${badge} vragen aandacht`}>
              {badge}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className={`mr-1 grid h-6 w-6 flex-shrink-0 place-items-center rounded ${collapsed ? "lg:hidden" : ""}`}
          style={{ color: "var(--a-side-mute)" }}
          aria-expanded={open}
          aria-label={`${hub.label} ${open ? "inklappen" : "uitklappen"}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`} aria-hidden>
            <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && (
        <ul className="mb-1.5 ml-[1.3125rem] mt-0.5 space-y-px pl-3" style={{ borderLeft: "1px solid var(--a-side-line)" }}>
          {hub.pages.map((page) => {
            const here = pathname === page.href || (page.href !== "/admin" && pathname.startsWith(`${page.href}/`));
            return (
              <li key={page.href}>
                <Link
                  href={page.href}
                  aria-current={here ? "page" : undefined}
                  className="block truncate rounded-md px-2.5 py-1.5 text-[0.8125rem] transition-colors hover:bg-[var(--a-side-hover)]"
                  style={{ color: here ? "#ffffff" : "var(--a-side-mute)", fontWeight: here ? 600 : 400 }}
                >
                  {page.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** De pagina's van dit onderdeel als tabbladen: dashboards binnen dashboards. */
function SectionTabs({ hub, current }: { hub: AdminHub; current: string }) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return (
    <nav aria-label={`Pagina's in ${hub.label}`} className="a-scroll-x overflow-x-auto px-3 sm:px-5 lg:px-7" style={{ borderBottom: "1px solid var(--a-border)" }}>
      <ul className="flex min-w-max items-center gap-5">
        {hub.pages.map((page) => {
          const here = page.href === current;
          return (
            <li key={page.href}>
              <Link
                ref={here ? activeRef : undefined}
                href={page.href}
                aria-current={here ? "page" : undefined}
                className="relative block whitespace-nowrap pb-2.5 pt-1 text-[0.8125rem] transition-colors"
                style={{ color: here ? "var(--a-text)" : "var(--a-mute)", fontWeight: here ? 600 : 500 }}
              >
                {page.label}
                {here && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: "var(--a-accent)" }} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function UserMenu({ userName, userMeta, avatarUrl }: { userName: string; userMeta: string; avatarUrl: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative ml-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="grid h-9 w-9 place-items-center rounded-full" aria-label="Accountmenu" aria-expanded={open}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold" style={{ background: "var(--a-accent)", color: "var(--a-on-accent)" }}>
            {initials(userName)}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl p-1" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border-strong)", boxShadow: "var(--a-shadow-lg)" }}>
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--a-text)" }}>{userName}</p>
            <p className="truncate text-xs" style={{ color: "var(--a-mute)" }}>{userMeta}</p>
          </div>
          <div className="my-1 h-px" style={{ background: "var(--a-border)" }} />
          <Link href="/" className="block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--a-elev)]" style={{ color: "var(--a-dim)" }}>
            Naar de website
          </Link>
          <Link href="/admin/beveiliging" className="block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--a-elev)]" style={{ color: "var(--a-dim)" }}>
            Beveiliging & 2FA
          </Link>
          <form action={logoutAction}>
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--a-elev)]" style={{ color: "var(--a-crit)" }}>
              Uitloggen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-[var(--a-elev)]" style={{ color: "var(--a-dim)" }} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/* iconen — currentColor */
const S = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;
function BarsIcon() { return <svg {...S}><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }
function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }
function SunIcon() { return <svg {...S}><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }
function MoonIcon() { return <svg {...S}><path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>; }
function GlobeIcon() { return <svg {...S}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CollapseIcon({ flipped }: { flipped: boolean }) { return <svg {...S} className={flipped ? "rotate-180" : ""}><rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M9 4v16M16 9.5 13.5 12l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
