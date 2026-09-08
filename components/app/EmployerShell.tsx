"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { LogoGlyph } from "@/components/brand/Logo";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import type { NavItem } from "@/components/app/AppShell";
import { useT, setLocale } from "@/components/i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { fmt } from "@/lib/i18n/dictionaries";

// ---------------------------------------------------------------------------
// Employer workspace shell — its own chrome (org name + rating in the topbar,
// language switch, help, a collapsible icon rail). The freelancer AppShell is
// left untouched.
// ---------------------------------------------------------------------------

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
  orgName,
  rating,
  userName,
  userMeta,
  helpHref = "/kennis/werkgevers",
  settingsHref = "/werkgever/instellingen",
  children,
}: {
  nav: NavItem[];
  locale: Locale;
  orgName: string;
  rating: { average: number; count: number } | null;
  userName: string;
  userMeta: string;
  helpHref?: string;
  settingsHref?: string;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("zf-emp-collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

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

  const isActive = (href: string) =>
    pathname === href || (href !== "/werkgever" && pathname.startsWith(href + "/")) ||
    (href === "/werkgever" && pathname === "/werkgever");
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
      className={`min-h-screen bg-paper-soft lg:grid ${
        collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[276px_1fr]"
      }`}
    >
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex transform flex-col border-r border-hair bg-gradient-to-b from-white to-paper-soft transition-all duration-300 ease-spring lg:static lg:translate-x-0 ${
          collapsed ? "w-[76px]" : "w-[276px]"
        } ${open ? "translate-x-0 shadow-e3" : "-translate-x-full"}`}
      >
        <div className={`flex h-16 items-center border-b border-hair ${collapsed ? "justify-center px-2" : "gap-2.5 px-5"}`}>
          <span className="transition-transform hover:rotate-6">
            <LogoGlyph size={26} />
          </span>
          {!collapsed && <p className="font-display text-sm font-bold">ZekerFlex</p>}
        </div>

        <button
          type="button"
          onClick={toggleCollapse}
          className={`hidden items-center gap-2 border-b border-hair py-2.5 text-xs font-medium text-neutralx-400 transition hover:text-brand-600 lg:flex ${
            collapsed ? "justify-center px-2" : "px-5"
          }`}
        >
          <span className={`transition-transform ${collapsed ? "rotate-180" : ""}`} aria-hidden>
            ←
          </span>
          {!collapsed && t.shell.collapse}
        </button>

        <nav className="flex-1 space-y-3 overflow-y-auto p-3">
          {groups.map((g, gi) => (
            <div key={gi} className="space-y-0.5">
              {g.section && !collapsed && (
                <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-neutralx-400">
                  {g.section}
                </p>
              )}
              {g.section && collapsed && gi > 0 && <div className="mx-3 my-2 border-t border-hair" />}
              {g.items.map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    title={collapsed ? n.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      collapsed ? "justify-center" : ""
                    } ${
                      active
                        ? "bg-white text-brand-700 shadow-e1"
                        : "text-neutralx-600 hover:bg-white/70 hover:text-ink"
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg transition ${
                        active
                          ? "bg-brand-50 text-brand-600"
                          : "text-neutralx-400 group-hover:bg-paper-soft group-hover:text-brand-500"
                      }`}
                    >
                      {n.icon}
                    </span>
                    {!collapsed && n.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-hair p-3">
          <Link
            href={settingsHref}
            onClick={() => setOpen(false)}
            title={collapsed ? t.shell.settings : undefined}
            aria-current={isActive(settingsHref) ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              collapsed ? "justify-center" : ""
            } ${isActive(settingsHref) ? "bg-white text-brand-700 shadow-e1" : "text-neutralx-600 hover:bg-white hover:text-ink"}`}
          >
            <span className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg ${isActive(settingsHref) ? "bg-brand-50 text-brand-600" : "text-neutralx-400"}`}>
              <SettingsGlyph />
            </span>
            {!collapsed && t.shell.settings}
          </Link>
          <form action={logoutAction}>
            <button
              title={collapsed ? t.shell.logout : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-neutralx-500 transition hover:bg-white hover:text-crit ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-neutralx-400">
                <LogoutGlyph />
              </span>
              {!collapsed && t.shell.logout}
            </button>
          </form>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      {/* Main */}
      <div className="app-bg noise flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-hair bg-white/80 px-4 backdrop-blur-xl lg:px-8">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-hairstrong lg:hidden"
            aria-label="Menu"
          >
            ☰
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate font-display text-sm font-bold text-ink">{orgName}</span>
            {rating && (
              <Link
                href="/werkgever/reviews"
                className="hidden items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-paper-soft sm:flex"
                title={t.shell.reviewsTitle}
              >
                <Stars value={rating.average} />
                <span className="text-xs text-brand-600 underline-offset-2 hover:underline">
                  {rating.count > 0
                    ? fmt(rating.count === 1 ? t.shell.reviewsCountOne : t.shell.reviewsCount, {
                        avg: rating.average.toFixed(1),
                        n: rating.count,
                      })
                    : t.shell.reviewsZero}
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
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>

            <Link
              href={helpHref}
              className="grid h-9 w-9 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:border-brand-400 hover:text-brand-600"
              aria-label={t.shell.help}
              title={t.shell.help}
            >
              ?
            </Link>

            <NotificationsBell />

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-hairstrong bg-white px-2.5 py-1.5 text-sm font-medium text-ink"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-semibold text-white">
                  {initials(userName)}
                </span>
                <span className="hidden max-w-[9rem] truncate sm:inline">{userName}</span>
                <span className="text-neutralx-400" aria-hidden>
                  ▾
                </span>
              </button>
              {userMenu && (
                <div
                  className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-hair bg-white p-1.5 shadow-lift"
                  onMouseLeave={() => setUserMenu(false)}
                >
                  <p className="px-3 py-1.5 text-xs text-neutralx-400">{userMeta}</p>
                  <Link href={settingsHref} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-paper-soft">
                    {t.shell.menuSettings}
                  </Link>
                  <Link href="/werkgever/bedrijf" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-paper-soft">
                    {t.shell.menuCompany}
                  </Link>
                  <Link href="/" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-paper-soft">
                    {t.common.naarWebsite}
                  </Link>
                  <form action={logoutAction}>
                    <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-crit hover:bg-crit/5">
                      {t.shell.logout}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        <main key={pathname} className="relative flex-1 animate-slide-up-fade px-4 py-8 lg:px-8 lg:py-10">
          <div className="mx-auto max-w-6xl 2xl:max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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
