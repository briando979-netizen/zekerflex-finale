"use client";

import { useEffect, useState } from "react";
import { Pill, btn, input } from "@/components/studio/ui";
import type { SiteRegel } from "@/lib/sites/meer-sites-core";
import type { SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// /studio, onder de twee kaarten: "Al je sites". Elke website en webshop van het bedrijf op een rij, met welke nu open
// staat, een knop om een andere te openen en een formulier om er nog een te maken (regels: lib/sites/meer-sites-core.ts).
// Een andere site openen verandert niets aan de sites zelf: wat online staat blijft online op zijn eigen adres.
// Het blok verschijnt pas als het bedrijf al een site heeft; de eerste maak je met de kaarten erboven.
// ---------------------------------------------------------------------------

interface Antwoord {
  sites?: SiteRegel[];
  max?: number;
  startpunten?: Record<SiteSoort, { id: string; naam: string }[]>;
  error?: { message?: string };
}

const WOORD: Record<SiteSoort, string> = { website: "Website", webshop: "Webshop" };

async function vraag(init?: RequestInit): Promise<Antwoord> {
  const r = await fetch("/api/werkgever/sites/lijst", { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  const d = (await r.json().catch(() => null)) as Antwoord | null;
  if (!r.ok || !d?.sites) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d;
}

export function MeerSites() {
  const [data, setData] = useState<Antwoord | null>(null);
  const [bezig, setBezig] = useState("");
  const [fout, setFout] = useState("");
  const [soort, setSoort] = useState<SiteSoort>("website");
  const [templateId, setTemplateId] = useState("");
  const [naam, setNaam] = useState("");

  useEffect(() => {
    vraag()
      .then(setData)
      // zonder lijst blijft de Studio gewoon werken met de kaarten erboven
      .catch(() => setData(null));
  }, []);

  const sites = data?.sites ?? [];
  if (sites.length === 0) return null;
  const max = data?.max ?? 5;
  const startpunten = data?.startpunten?.[soort] ?? [];
  const gekozenStartpunt = startpunten.some((t) => t.id === templateId) ? templateId : (startpunten[0]?.id ?? "");
  const vol = sites.filter((s) => s.soort === soort).length >= max;

  async function open(id: string, s: SiteSoort) {
    setBezig(id);
    setFout("");
    try {
      await vraag({ method: "POST", body: JSON.stringify({ actie: "kies", id }) });
      // een volledige paginalading: de Studio leest dan de site die nu open staat
      window.location.assign(`/studio/${s}`);
    } catch (e) {
      setFout((e as Error).message);
      setBezig("");
    }
  }

  async function maak() {
    setBezig("maak");
    setFout("");
    try {
      await vraag({ method: "POST", body: JSON.stringify({ actie: "maak", soort, templateId: gekozenStartpunt, naam: naam.trim() }) });
      window.location.assign(`/studio/${soort}`);
    } catch (e) {
      setFout((e as Error).message);
      setBezig("");
    }
  }

  return (
    <section aria-labelledby="al-je-sites" className="mt-4 rounded-3xl border border-[#e3e3e3] bg-white p-6">
      <h2 id="al-je-sites" className="text-base font-bold tracking-tight text-[#1a1a1a]">
        Al je sites
      </h2>
      <p className="mt-1 text-sm text-[#616161]">Elke website en webshop van je bedrijf. Open er een om eraan te werken; de andere blijven gewoon online op hun eigen adres.</p>
      <ul className="mt-4 divide-y divide-[#f1f1f1]">
        {sites.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#1a1a1a]">{s.naam}</p>
              <p className="truncate text-xs text-[#707070]">
                {WOORD[s.soort]} · adres /site/{s.slug}
              </p>
            </div>
            <Pill tone={s.online ? "ok" : "warn"}>{s.online ? "Online" : "Concept"}</Pill>
            {s.actief ? (
              <Pill>Staat open</Pill>
            ) : (
              <button type="button" onClick={() => void open(s.id, s.soort)} disabled={bezig !== ""} className={btn.secondary}>
                {bezig === s.id ? "Bezig…" : "Open deze"}
                <span className="sr-only">: {s.naam}</span>
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-semibold text-[#1a1a1a]">Nog een site maken</h3>
      <p className="mt-1 text-sm text-[#616161]">Je bestaande sites blijven zoals ze zijn. De nieuwe site begint als concept en staat daarna open in de Studio.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="ms-soort" className="mb-1 block text-sm font-medium text-[#303030]">
            Soort
          </label>
          <select id="ms-soort" className={input} value={soort} onChange={(e) => setSoort(e.target.value === "webshop" ? "webshop" : "website")}>
            <option value="website">Website</option>
            <option value="webshop">Webshop</option>
          </select>
        </div>
        <div>
          <label htmlFor="ms-startpunt" className="mb-1 block text-sm font-medium text-[#303030]">
            Startpunt
          </label>
          <select id="ms-startpunt" className={input} value={gekozenStartpunt} onChange={(e) => setTemplateId(e.target.value)}>
            {startpunten.map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ms-naam" className="mb-1 block text-sm font-medium text-[#303030]">
            Naam van de site
          </label>
          <input id="ms-naam" className={input} maxLength={100} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijvoorbeeld: Bakkerij Jansen Catering" />
        </div>
      </div>
      {vol ? <p className="mt-3 text-sm text-[#707070]">Je hebt het meeste aantal ({max}) van deze soort.</p> : null}
      {fout ? (
        <p role="alert" className="mt-3 rounded-xl bg-[#fed1d7] px-4 py-2.5 text-sm text-[#8e0b21]">
          {fout}
        </p>
      ) : null}
      <div className="mt-4">
        <button type="button" onClick={() => void maak()} disabled={bezig !== "" || vol || !naam.trim() || !gekozenStartpunt} className={btn.primary}>
          {bezig === "maak" ? "Bezig…" : `Maak deze ${soort === "webshop" ? "webshop" : "website"}`}
        </button>
      </div>
    </section>
  );
}
