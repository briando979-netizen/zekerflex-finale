"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { BASE } from "@/lib/voorstel/schwarzwald";
import { Logo } from "@/components/voorstel/SchwarzwaldHeader";
import { Dashboard } from "@/components/voorstel/beheer/Dashboard";
import { Planning } from "@/components/voorstel/beheer/Planning";
import { Klanten } from "@/components/voorstel/beheer/Klanten";
import { Aanvragen } from "@/components/voorstel/beheer/Aanvragen";
import { Reserveringen } from "@/components/voorstel/beheer/Reserveringen";
import { Aankondiging, Activiteiten, Openingstijden } from "@/components/voorstel/beheer/Instellingen";
import { Paginas } from "@/components/voorstel/beheer/Paginas";
import { Accounts } from "@/components/voorstel/beheer/Accounts";
import { Reviews } from "@/components/voorstel/beheer/Reviews";
import { Sollicitaties } from "@/components/voorstel/beheer/Sollicitaties";
import { Wachtlijst } from "@/components/voorstel/beheer/Wachtlijst";
import { Nieuws } from "@/components/voorstel/beheer/Nieuws";
import type { InboekStart } from "@/lib/voorstel/inboek-regels";

// De beheeromgeving van Het Schwarzwald als eigen dashboard: zijbalk met de
// tabbladen in groepen (op de telefoon een balk bovenaan), een kop per
// tabblad, "Naar de website" en "Uitloggen". Het gekozen tabblad staat in de
// adresbalk (#tab, of #klanten=<e-mail> voor een klantdossier).

const TABS = [
  ["dashboard", "Dashboard"],
  ["planning", "Planning"],
  ["reserveringen", "Reserveringen"],
  ["wachtlijst", "Wachtlijst"],
  ["klanten", "Klanten (CRM)"],
  ["aanvragen", "Aanvragen"],
  ["reviews", "Reviews"],
  ["paginas", "Pagina's"],
  ["nieuws", "Nieuws"],
  ["activiteiten", "Activiteiten"],
  ["openingstijden", "Openingstijden"],
  ["sollicitaties", "Sollicitaties"],
  ["accounts", "Accounts"],
  ["instellingen", "Instellingen"],
] as const;
type Tab = (typeof TABS)[number][0];
const LABEL = Object.fromEntries(TABS) as Record<Tab, string>;
const GROEPEN: readonly (readonly [string, readonly Tab[]])[] = [
  ["Overzicht", ["dashboard", "planning"]],
  ["Gasten", ["reserveringen", "wachtlijst", "klanten", "aanvragen", "reviews"]],
  ["Website", ["paginas", "nieuws", "activiteiten", "openingstijden"]],
  ["Organisatie", ["sollicitaties", "accounts", "instellingen"]],
];

function Uitloggen({ via, licht = false }: { via: "schwarzwald" | "zekerflex"; licht?: boolean }) {
  const stijl = licht ? "rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/10" : "rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15 hover:bg-schw-sand";
  if (via === "zekerflex") {
    return (
      <form action={logoutAction}>
        <button type="submit" className={stijl}>
          Uitloggen
        </button>
      </form>
    );
  }
  return (
    <button
      type="button"
      className={stijl}
      onClick={() =>
        void fetch("/api/voorstel/schwarzwald/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actie: "uitloggen" }) }).finally(() => {
          window.location.href = `${BASE}/account`;
        })
      }
    >
      Uitloggen
    </button>
  );
}

export function BeheerApp({
  namen,
  duur,
  vandaag,
  wie,
  via,
}: {
  namen: Record<string, string>;
  duur: Record<string, number>;
  vandaag: string;
  wie: string;
  via: "schwarzwald" | "zekerflex";
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [klant, setKlant] = useState("");
  // een aanvraag die als reservering wordt ingeboekt (Aanvragen → Reserveringen)
  const [inboek, setInboek] = useState<InboekStart | null>(null);

  useEffect(() => {
    const lees = () => {
      const [h, email] = decodeURIComponent(window.location.hash.slice(1)).split("=");
      if (TABS.some(([k]) => k === h)) setTab(h as Tab);
      if (h === "klanten" && email) setKlant(email);
    };
    lees();
    window.addEventListener("hashchange", lees);
    return () => window.removeEventListener("hashchange", lees);
  }, []);

  const naar = (t: Tab) => {
    setTab(t);
    window.history.replaceState(window.history.state, "", `#${t}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openKlant = (email: string) => {
    setKlant(email);
    setTab("klanten");
    window.history.replaceState(window.history.state, "", `#klanten=${encodeURIComponent(email)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const titel = LABEL[tab];

  return (
    <div className="min-h-screen bg-[#F3EEE6] lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="bg-schw-night text-schw-cream lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-6 lg:pb-4 lg:pt-6">
          <Link href={BASE} aria-label="Naar de website" className="flex items-center gap-3">
            <Logo className="h-10 w-auto lg:h-16" />
            <span className="font-display text-lg font-bold lg:hidden">Beheer</span>
          </Link>
          <p className="mt-3 hidden text-xs font-bold uppercase tracking-[0.18em] text-schw-sun lg:block">Beheer</p>
          <div className="lg:hidden">
            <Uitloggen via={via} licht />
          </div>
        </div>
        <nav aria-label="Beheer" className="lg:flex-1">
          <div role="tablist" aria-label="Beheer" className="flex gap-1 overflow-x-auto px-4 pb-3 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-3">
            {GROEPEN.map(([groep, tabs]) => (
              <div key={groep} className="contents lg:block lg:pb-4">
                <p aria-hidden="true" className="hidden px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-schw-cream/60 lg:block">
                  {groep}
                </p>
                {tabs.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    aria-controls={`paneel-${k}`}
                    onClick={() => naar(k)}
                    className={`shrink-0 rounded-full px-4 py-2 text-left text-sm font-semibold transition-colors lg:block lg:w-full lg:rounded-xl lg:px-3 ${
                      tab === k ? "bg-schw-orange text-schw-night" : "text-schw-cream/85 hover:bg-white/10"
                    }`}
                  >
                    {LABEL[k]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-schw-night/10 bg-white px-4 py-4 sm:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-schw-mute">Het Schwarzwald · beheer</p>
            <h1 className="font-display text-2xl font-bold">{titel}</h1>
          </div>
          {/* altijd in beeld, ook op een laag laptopscherm */}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-schw-mute">Ingelogd als {wie}</p>
            <Link href={BASE} className="hidden rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15 hover:bg-schw-sand lg:inline-block">
              Naar de website
            </Link>
            <span className="hidden lg:inline">
              <Uitloggen via={via} />
            </span>
          </div>
        </header>
        <div id={`paneel-${tab}`} role="tabpanel" aria-label={titel} className="px-4 py-6 sm:px-8">
          {tab === "dashboard" && <Dashboard namen={namen} naar={naar} openKlant={openKlant} />}
          {tab === "planning" && <Planning namen={namen} duur={duur} vandaag={vandaag} openKlant={openKlant} />}
          {tab === "klanten" && <Klanten namen={namen} vandaag={vandaag} start={klant} />}
          {tab === "aanvragen" && (
            <Aanvragen
              namen={namen}
              openKlant={openKlant}
              inboeken={(s) => {
                setInboek(s);
                naar("reserveringen");
              }}
            />
          )}
          {tab === "reserveringen" && <Reserveringen namen={namen} duur={duur} vandaag={vandaag} start={inboek} klaarStart={() => setInboek(null)} />}
          {tab === "wachtlijst" && <Wachtlijst namen={namen} openKlant={openKlant} />}
          {tab === "reviews" && <Reviews namen={namen} openKlant={openKlant} />}
          {tab === "sollicitaties" && <Sollicitaties />}
          {tab === "activiteiten" && <Activiteiten namen={namen} />}
          {tab === "openingstijden" && <Openingstijden namen={namen} />}
          {tab === "paginas" && <Paginas />}
          {tab === "nieuws" && <Nieuws vandaag={vandaag} />}
          {tab === "accounts" && <Accounts />}
          {tab === "instellingen" && <Aankondiging />}
        </div>
      </div>
    </div>
  );
}
