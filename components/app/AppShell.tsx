"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { LogoGlyph } from "@/components/brand/Logo";
import { NotificationsBell } from "@/components/app/NotificationsBell";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** optional grouping heading */
  section?: string;
}

export function AppShell({
  nav,
  brandLabel,
  userName,
  userMeta,
  children,
}: {
  nav: NavItem[];
  brandLabel: string;
  userName: string;
  userMeta: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  const current = nav.find((n) => isActive(n.href));

  // Group nav items by optional section, preserving order.
  const groups: { section: string | null; items: NavItem[] }[] = [];
  for (const item of nav) {
    const key = item.section ?? null;
    const last = groups[groups.length - 1];
    if (last && last.section === key) last.items.push(item);
    else groups.push({ section: key, items: [item] });
  }

  return (
    <div className="min-h-screen bg-paper-soft lg:grid lg:grid-cols-[264px_1fr]">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] transform flex-col border-r border-hair bg-gradient-to-b from-white to-paper-soft transition-transform duration-300 ease-spring lg:static lg:translate-x-0 ${
          open ? "translate-x-0 shadow-e3" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-hair px-5">
          <span className="transition-transform hover:rotate-6">
            <LogoGlyph size={28} />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold">ZekerFlex</p>
            <p className="text-[11px] font-medium uppercase tracking-wider text-brand-500">{brandLabel}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {groups.map((g, gi) => (
            <div key={gi} className="space-y-0.5">
              {g.section && (
                <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-neutralx-400">
                  {g.section}
                </p>
              )}
              {g.items.map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      active
                        ? "bg-white text-brand-700 shadow-e1"
                        : "text-neutralx-600 hover:bg-white/70 hover:text-ink"
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-mint to-brand-500 transition-all duration-300 ${
                        active ? "w-1 opacity-100" : "w-0 opacity-0"
                      }`}
                      aria-hidden
                    />
                    <span
                      className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg transition ${
                        active
                          ? "bg-brand-50 text-brand-600"
                          : "text-neutralx-400 group-hover:bg-paper-soft group-hover:text-brand-500"
                      }`}
                    >
                      {n.icon}
                    </span>
                    {n.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-hair p-3">
          <div className="mb-1 flex items-center gap-2 px-3 text-[11px] text-neutralx-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-mint animate-pulse-dot" />
            Sovereign · lokaal gehost
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-e1">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
              {initials(userName)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-ink">{userName}</p>
              <p className="truncate text-[11px] text-neutralx-500">{userMeta}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-neutralx-500 transition hover:bg-white hover:text-crit">
              Uitloggen
            </button>
          </form>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Main */}
      <div className="app-bg noise flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-hair bg-white/75 px-4 backdrop-blur-xl lg:px-8">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-hairstrong lg:hidden"
            aria-label="Menu"
          >
            ☰
          </button>
          <nav aria-label="Broodkruimel" className="hidden items-center gap-2 text-sm text-neutralx-500 sm:flex">
            <span className="font-medium text-neutralx-400">{brandLabel}</span>
            <span className="text-hairstrong">/</span>
            <span className="font-semibold text-ink">{current?.label ?? "Overzicht"}</span>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="num hidden font-mono text-xs text-neutralx-400 lg:inline">{clock}</span>
            <NotificationsBell />
            <Link href="/" className="hidden text-sm font-medium text-neutralx-500 transition hover:text-brand-600 sm:inline">
              Naar website
            </Link>
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
