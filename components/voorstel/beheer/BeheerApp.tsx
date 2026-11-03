"use client";

import { useEffect, useState } from "react";
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

// De beheeromgeving van Het Schwarzwald: dashboard, CRM (klanten en
// aanvragen) en alles wat het personeel zelf regelt. Het gekozen tabblad staat
// in de adresbalk (#tab, of #klanten=<e-mail> voor een klantdossier).

const TABS = [
  ["dashboard", "Dashboard"],
  ["planning", "Planning"],
  ["klanten", "Klanten (CRM)"],
  ["aanvragen", "Aanvragen"],
  ["reserveringen", "Reserveringen"],
  ["wachtlijst", "Wachtlijst"],
  ["reviews", "Reviews"],
  ["sollicitaties", "Sollicitaties"],
  ["activiteiten", "Activiteiten"],
  ["openingstijden", "Openingstijden"],
  ["paginas", "Pagina's"],
  ["accounts", "Accounts"],
  ["instellingen", "Instellingen"],
] as const;
type Tab = (typeof TABS)[number][0];

export function BeheerApp({ namen, duur, vandaag, wie }: { namen: Record<string, string>; duur: Record<string, number>; vandaag: string; wie: string }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [klant, setKlant] = useState("");

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

  return (
    <div>
      <p className="text-sm text-schw-mute">Ingelogd als {wie}</p>
      <div role="tablist" aria-label="Beheer" className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls={`paneel-${k}`}
            onClick={() => naar(k)}
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${tab === k ? "bg-schw-night text-schw-cream" : "bg-white ring-1 ring-schw-night/10 hover:ring-schw-night/30"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div id={`paneel-${tab}`} role="tabpanel" className="mt-6">
        {tab === "dashboard" && <Dashboard namen={namen} naar={naar} openKlant={openKlant} />}
        {tab === "planning" && <Planning namen={namen} duur={duur} vandaag={vandaag} openKlant={openKlant} />}
        {tab === "klanten" && <Klanten namen={namen} vandaag={vandaag} start={klant} />}
        {tab === "aanvragen" && <Aanvragen openKlant={openKlant} />}
        {tab === "reserveringen" && <Reserveringen namen={namen} vandaag={vandaag} />}
        {tab === "wachtlijst" && <Wachtlijst namen={namen} openKlant={openKlant} />}
        {tab === "reviews" && <Reviews namen={namen} openKlant={openKlant} />}
        {tab === "sollicitaties" && <Sollicitaties />}
        {tab === "activiteiten" && <Activiteiten namen={namen} />}
        {tab === "openingstijden" && <Openingstijden namen={namen} />}
        {tab === "paginas" && <Paginas />}
        {tab === "accounts" && <Accounts />}
        {tab === "instellingen" && <Aankondiging />}
      </div>
    </div>
  );
}
