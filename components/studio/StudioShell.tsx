"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { StudioProvider, useStudio } from "@/components/studio/context";
import { ICalendar, ICoins, IExternal, IHome, ILayout, IMenu, IPalette, IReceipt, ISettings, IStore, ITag, IUsers, IX, Pill, btn } from "@/components/studio/ui";

// ---------------------------------------------------------------------------
// De Websitestudio (/studio): een eigen, volledig scherm om de website en de
// webshop van het bedrijf te beheren, los van het werkgeversdashboard. Boven:
// de site, "Bekijk website" en Publiceren; links: de onderdelen; op de
// telefoon klapt het menu uit. Gegevens: components/studio/context.tsx.
// ---------------------------------------------------------------------------

const NAV = [
  { href: "/studio", label: "Overzicht", icon: <IHome /> },
  { href: "/studio/producten", label: "Producten", icon: <ITag /> },
  { href: "/studio/bestellingen", label: "Bestellingen", icon: <IReceipt /> },
  { href: "/studio/reserveringen", label: "Reserveringen", icon: <ICalendar /> },
  { href: "/studio/klanten", label: "Klanten", icon: <IUsers /> },
  { href: "/studio/verkopen", label: "Verkopen op ZekerFlex", icon: <IStore /> },
  { href: "/studio/website", label: "Website", icon: <ILayout /> },
  { href: "/studio/ontwerp", label: "Ontwerp", icon: <IPalette /> },
  { href: "/studio/verdienen", label: "Verdienen", icon: <ICoins /> },
  { href: "/studio/instellingen", label: "Instellingen", icon: <ISettings /> },
];

// Verkopen op ZekerFlex en Verdienen horen bij de ZekerFlex-shop, niet bij een eigen website.
const ZONDER_SITE = ["/studio/website", "/studio/verkopen", "/studio/verdienen"];

const isActive = (path: string, href: string) => (href === "/studio" ? path === "/studio" : path === href || path.startsWith(`${href}/`));

export function StudioShell({ children }: { children: ReactNode }) {
  return (
    <StudioProvider>
      <Shell>{children}</Shell>
    </StudioProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/studio";
  // het telefoonmenu hoort bij één pagina: na een klik op een onderdeel is het vanzelf dicht
  const [menuOp, setMenuOp] = useState<string | null>(null);
  const menu = menuOp === path;
  const wide = path.startsWith("/studio/website");
  return (
    <div className="min-h-dvh bg-[#f1f1f1] text-[#303030]">
      <TopBar onMenu={() => setMenuOp((m) => (m === path ? null : path))} menu={menu} />
      <div className="flex">
        {/* een div, geen aside: de nav erin is het (benoemde) landmark */}
        <div className={`${menu ? "fixed inset-x-0 top-14 z-30 block border-b border-[#e3e3e3] shadow-lg" : "hidden"} w-full bg-[#ebebeb] md:sticky md:top-14 md:block md:h-[calc(100dvh-3.5rem)] md:w-60 md:flex-shrink-0 md:border-0 md:shadow-none`}>
          <SideNav path={path} />
        </div>
        <main className={`min-w-0 flex-1 px-4 py-6 sm:px-6 ${wide ? "" : "lg:px-10"}`}>
          <div className={wide ? "" : "mx-auto max-w-[1100px]"}>
            <Body path={path}>{children}</Body>
          </div>
        </main>
      </div>
    </div>
  );
}

function TopBar({ onMenu, menu }: { onMenu: () => void; menu: boolean }) {
  const { data, unpublished, publish } = useStudio();
  const inBouwer = (usePathname() ?? "").startsWith("/studio/website");
  const [busy, setBusy] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; text: string } | null>(null);
  const site = data?.site;
  const live = Boolean(site?.liveBuild);
  const doPublish = async () => {
    setBusy(true);
    const fout = await publish();
    setBusy(false);
    setMelding(fout ? { ok: false, text: fout } : { ok: true, text: "Je website is bijgewerkt." });
    setTimeout(() => setMelding(null), 4000);
  };
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-[#1a1a1a] px-3 text-white sm:px-4">
      <button type="button" onClick={onMenu} aria-expanded={menu} aria-label={menu ? "Menu sluiten" : "Menu openen"} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10 md:hidden">
        {menu ? <IX /> : <IMenu />}
      </button>
      <Link href="/studio" className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-sm font-black text-[#1a1a1a]">Z</span>
        <span className="hidden sm:inline">Websitestudio</span>
      </Link>
      {site && <span className="hidden truncate text-sm text-white/60 lg:inline">· {site.bedrijf.naam}</span>}
      <div className="ml-auto flex items-center gap-2">
        {melding && (
          <span role={melding.ok ? "status" : "alert"} className={`hidden rounded-lg px-2 py-1 text-xs font-semibold sm:inline ${melding.ok ? "bg-[#cdfed4] text-[#014b1a]" : "bg-[#fed1d7] text-[#8e0b21]"}`}>
            {melding.text}
          </span>
        )}
        {site && (live ? <Pill tone="ok">Online</Pill> : <Pill tone="warn">Concept</Pill>)}
        {site && live && data?.address && (
          <a href={data.address} target="_blank" rel="noopener" className="hidden items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-white/90 hover:bg-white/10 sm:inline-flex">
            Bekijk website <IExternal width={15} height={15} />
          </a>
        )}
        {/* in de paginabouwer zit een eigen publiceerknop */}
        {site && data?.canPublish && !inBouwer && (
          <button type="button" disabled={busy || (!unpublished && live)} onClick={() => void doPublish()} className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-[#1a1a1a] hover:bg-white/90 disabled:opacity-40">
            {busy ? "Bezig…" : live ? (unpublished ? "Wijzigingen publiceren" : "Gepubliceerd") : "Publiceren"}
          </button>
        )}
      </div>
    </header>
  );
}

function SideNav({ path }: { path: string }) {
  const { data } = useStudio();
  const [nieuw, setNieuw] = useState(0);
  const heeftSite = Boolean(data?.site);
  useEffect(() => {
    if (!heeftSite) return;
    // het aantal nieuwe bestellingen naast "Bestellingen"
    void fetch("/api/werkgever/sites/bestellingen", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bestellingen: { status: string }[] } | null) => setNieuw(d?.bestellingen.filter((b) => b.status === "nieuw").length ?? 0))
      .catch(() => undefined);
  }, [heeftSite, path]);
  return (
    <nav aria-label="Websitestudio" className="flex h-full flex-col p-2">
      <ul className="space-y-0.5">
        {NAV.map((n) => {
          const on = isActive(path, n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${on ? "bg-white text-[#1a1a1a] shadow-[0_1px_0_rgba(0,0,0,.08)]" : "text-[#4a4a4a] hover:bg-white/60"}`}
              >
                <span className={on ? "text-[#1a1a1a]" : "text-[#616161]"}>{n.icon}</span>
                <span className="flex-1">{n.label}</span>
                {n.href === "/studio/bestellingen" && nieuw > 0 && <span className="rounded-full bg-[#1a1a1a] px-1.5 text-[11px] font-bold text-white">{nieuw}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-black/10 px-3 pt-3">
        <Link href="/werkgever" className="text-xs font-semibold text-[#616161] hover:text-[#1a1a1a]">← Terug naar ZekerFlex</Link>
      </div>
    </nav>
  );
}

/** Zonder website eerst de start (de bouwer maakt hem); verder de pagina zelf. */
function Body({ path, children }: { path: string; children: ReactNode }) {
  const { data, error } = useStudio();
  if (error) return <p role="alert" className="rounded-2xl bg-[#fed1d7] p-5 text-sm text-[#8e0b21]">{error}</p>;
  if (!data) return <div className="h-48 animate-pulse rounded-2xl bg-white/70" />;
  if (!data.site && !ZONDER_SITE.some((p) => path.startsWith(p))) {
    return (
      <section className="overflow-hidden rounded-3xl bg-[#1a1a1a] px-6 py-14 text-center text-white sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Websitestudio</p>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Je eigen website en webshop, in een paar minuten</h1>
        <p className="mx-auto mt-3 max-w-xl text-white/70">Kies een ontwerp voor je branche. Daarna voeg je producten toe, ontvang je bestellingen en beheer je alles hier.</p>
        <Link href="/studio/website" className={`${btn.secondary} mt-7 border-0`}>Begin met je website</Link>
      </section>
    );
  }
  return <>{children}</>;
}
