"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { NotificationsBell } from "@/components/app/NotificationsBell";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: ReactNode;
  section?: string;
}

const THEME_KEY = "zf-admin-theme";

export function AdminShell({
  nav,
  userName,
  userMeta,
  children,
}: {
  nav: AdminNavItem[];
  userName: string;
  userMeta: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clock, setClock] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }));
    t();
    const id = setInterval(t, 20_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));
  const current = nav.find((n) => isActive(n.href));

  const groups: { section: string | null; items: AdminNavItem[] }[] = [];
  for (const item of nav) {
    const key = item.section ?? null;
    const last = groups[groups.length - 1];
    if (last && last.section === key) last.items.push(item);
    else groups.push({ section: key, items: [item] });
  }

  const sidebarW = collapsed ? "5rem" : "16rem";

  return (
    <div
      className="admin-scope min-h-screen"
      data-theme={theme}
      style={{ background: "var(--a-page)" }}
    >
      <div className="flex min-h-screen flex-col gap-3 p-3 lg:p-4">
        {/* Topbar */}
        <header className="a-panel flex h-14 flex-shrink-0 items-center gap-3 px-3 lg:h-16 lg:px-4">
          <button
            type="button"
            onClick={() => {
              setCollapsed((v) => !v);
              setMobileOpen((v) => !v);
            }}
            className="a-elev grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl"
            style={{ border: "1px solid var(--a-border)" }}
            aria-label="Menu"
          >
            <Bars />
          </button>
          <Link href="/admin" className="flex flex-shrink-0 items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0C0E12] text-[11px] font-bold text-white">
              ZF
            </span>
            <span className="hidden font-display text-[0.95rem] font-bold sm:inline" style={{ color: "var(--a-text)" }}>
              ZekerFlex
            </span>
          </Link>

          <div className="mx-auto hidden w-full max-w-md items-center gap-2 rounded-full px-3.5 py-2 md:flex"
            style={{ background: "var(--a-panel-2)", border: "1px solid var(--a-border)" }}>
            <Search />
            <input
              placeholder="Zoeken…"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--a-text)" }}
              onFocus={(e) => e.currentTarget.blur()}
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              readOnly
            />
            <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]" style={{ borderColor: "var(--a-border)", color: "var(--a-mute)" }}>
              ⌘K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium lg:flex"
              style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
              🇳🇱 NL
            </span>
            <span className="num hidden font-mono text-xs md:inline" style={{ color: "var(--a-mute)" }}>{clock}</span>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}
              aria-label="Thema wisselen"
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </button>
            <NotificationsBell dark />
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl px-1.5 py-1.5"
                style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-[11px] font-bold text-white">
                  {initials(userName)}
                </span>
                <span className="hidden text-sm font-medium sm:inline" style={{ color: "var(--a-text)" }}>
                  {userName.split(" ")[0]}
                </span>
                <Chevron />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl p-1 shadow-2xl"
                  style={{ background: "var(--a-panel)", border: "1px solid var(--a-border-strong)" }}
                >
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium" style={{ color: "var(--a-text)" }}>{userName}</p>
                    <p className="text-xs" style={{ color: "var(--a-mute)" }}>{userMeta}</p>
                  </div>
                  <Link href="/" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5" style={{ color: "var(--a-dim)" }}>
                    Naar website
                  </Link>
                  <form action={logoutAction}>
                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#f87171] hover:bg-white/5">
                      Uitloggen
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex flex-1 gap-3 lg:gap-4">
          {/* Sidebar */}
          <aside
            className={`a-panel fixed inset-y-3 left-3 z-40 flex flex-col overflow-hidden transition-transform duration-300 lg:static lg:inset-auto lg:z-auto lg:translate-x-0 ${
              mobileOpen ? "translate-x-0" : "-translate-x-[110%]"
            }`}
            style={{ width: sidebarW }}
          >
            <nav className="flex-1 space-y-5 overflow-y-auto p-3">
              {groups.map((g, gi) => (
                <div key={gi} className="space-y-1">
                  {g.section && !collapsed && (
                    <p className="px-3 pb-1 pt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--a-mute)" }}>
                      {g.section}
                    </p>
                  )}
                  {g.items.map((n) => {
                    const active = isActive(n.href);
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        onClick={() => setMobileOpen(false)}
                        title={collapsed ? n.label : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                          collapsed ? "justify-center" : ""
                        }`}
                        style={{
                          background: active ? "var(--a-elev)" : "transparent",
                          color: active ? "var(--a-text)" : "var(--a-dim)",
                          fontWeight: active ? 600 : 500,
                        }}
                      >
                        <span className="flex-shrink-0" style={{ color: active ? "var(--a-accent)" : "var(--a-mute)" }}>
                          {n.icon}
                        </span>
                        {!collapsed && <span className="truncate">{n.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="border-t p-3" style={{ borderColor: "var(--a-border)" }}>
              <div className={`mb-2 flex items-center gap-2 px-2 text-[11px] ${collapsed ? "justify-center" : ""}`} style={{ color: "var(--a-mute)" }}>
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                {!collapsed && "Sovereign · lokaal"}
              </div>
              <form action={logoutAction}>
                <button
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/5 ${
                    collapsed ? "justify-center" : ""
                  }`}
                  style={{ color: "var(--a-dim)" }}
                >
                  <LogoutIcon />
                  {!collapsed && "Uitloggen"}
                </button>
              </form>
            </div>
          </aside>

          {mobileOpen && (
            <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
          )}

          {/* Content */}
          <main className="min-w-0 flex-1">
            <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: "var(--a-mute)" }}>
              <HomeIcon />
              <span>›</span>
              <span>Beheer</span>
              <span>›</span>
              <span style={{ color: "var(--a-text)" }}>{current?.label ?? "Controlecentrum"}</span>
            </div>
            <div key={pathname} className="animate-slide-up-fade pb-10">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/* icons — 18px, currentColor */
const S = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" } as const;
function Bars() { return <svg {...S}><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }
function Search() { return <svg {...S} style={{ color: "var(--a-mute)" }}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }
function Sun() { return <svg {...S} style={{ color: "var(--a-text)" }}><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }
function Moon() { return <svg {...S} style={{ color: "var(--a-text)" }}><path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>; }
function Chevron() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "var(--a-mute)" }}><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function HomeIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 11 12 4l8 7M6 10v9h12v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function LogoutIcon() { return <svg {...S}><path d="M15 4h4v16h-4M11 12h9m0 0-3-3m3 3-3 3M4 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
