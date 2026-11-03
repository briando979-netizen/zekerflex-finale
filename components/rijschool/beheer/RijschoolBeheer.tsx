"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import type { BeheerActie } from "@/lib/rijschool/schema";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Tabs, Veld } from "@/components/rijschool/ui";
import { AgendaTab } from "@/components/rijschool/beheer/AgendaTab";
import { LeerlingenTab } from "@/components/rijschool/beheer/LeerlingenTab";
import { TeamTab } from "@/components/rijschool/beheer/TeamTab";
import { PakkettenTab } from "@/components/rijschool/beheer/PakkettenTab";
import { WebsiteTab } from "@/components/rijschool/beheer/WebsiteTab";
import { InstellingenTab } from "@/components/rijschool/beheer/InstellingenTab";
import { BetalingenTab } from "@/components/rijschool/beheer/BetalingenTab";
import { AppTab } from "@/components/rijschool/beheer/AppTab";
import { euro } from "@/lib/payroll/format";
import { LEERLING_STATUS_LABEL } from "@/lib/rijschool/format";

// ---------------------------------------------------------------------------
// Het beheer van het rijschool-pakket (/werkgever/rijschool): aanzetten,
// overzicht, agenda, leerlingen, betalingen, team en auto's, pakketten,
// website, instellingen en de app. Alle wijzigingen gaan via één eindpunt
// (PATCH /api/rijschool/beheer) dat de nieuwe stand terugstuurt.
// ---------------------------------------------------------------------------

type TabId = "overzicht" | "agenda" | "leerlingen" | "betalingen" | "team" | "pakketten" | "website" | "instellingen" | "app";

const TABS: { id: TabId; label: string }[] = [
  { id: "overzicht", label: "Overzicht" },
  { id: "agenda", label: "Agenda" },
  { id: "leerlingen", label: "Leerlingen" },
  { id: "betalingen", label: "Betalingen" },
  { id: "team", label: "Instructeurs en auto's" },
  { id: "pakketten", label: "Pakketten en prijzen" },
  { id: "website", label: "Website" },
  { id: "instellingen", label: "Instellingen" },
  { id: "app", label: "App" },
];

export type Doe = (actie: BeheerActie) => Promise<Record<string, unknown>>;

interface Voorstel {
  naam: string;
  plaats: string;
  telefoon: string;
  email: string;
}

export function RijschoolBeheer() {
  const router = useRouter();
  const [data, setData] = useState<BeheerWeergave | null>(null);
  const [voorstel, setVoorstel] = useState<Voorstel | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overzicht");
  const [leerlingFocus, setLeerlingFocus] = useState<string | null>(null);

  useEffect(() => {
    stuur<({ aan: true } & BeheerWeergave) | { aan: false; voorstel: Voorstel }>("/api/rijschool/beheer")
      .then((r) => (r.aan ? setData(r) : setVoorstel(r.voorstel)))
      .catch((e) => setFout(foutVan(e)));
  }, []);

  const doe: Doe = useCallback(async (actie) => {
    const r = await stuur<BeheerWeergave & Record<string, unknown>>("/api/rijschool/beheer", "PATCH", actie);
    setData(r);
    return r;
  }, []);

  if (!data) {
    if (voorstel) {
      return (
        <Aanzetten
          voorstel={voorstel}
          onAan={(d) => {
            setData(d);
            // het menu (servercomponent) krijgt nu het onderdeel Rijschool erbij
            router.refresh();
          }}
        />
      );
    }
    return fout ? <Melding fout={fout} /> : <p className="text-sm text-neutralx-500">Laden…</p>;
  }

  const r = data.rijschool;
  const openLeerling = (id: string) => {
    setLeerlingFocus(id);
    setTab("leerlingen");
  };

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl text-lg font-bold text-white" style={{ background: r.kleur }} aria-hidden>
          {r.naam.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold text-ink">{r.naam}</h1>
          <p className="truncate text-sm text-neutralx-600">
            {r.online ? <span className="pill-ok mr-2">Website online</span> : <span className="pill-warn mr-2">Website nog niet online</span>}
            <a href={r.url} target="_blank" rel="noopener" className="font-medium text-brand-600 hover:underline">
              {r.url.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/rijschool/${r.slug}/instructeur`} className="btn-ghost">
            Instructeur-app
          </a>
          <a href={r.url} target="_blank" rel="noopener" className="btn-primary">
            Bekijk website
          </a>
        </div>
      </section>

      <Tabs tabs={TABS} actief={tab} onKies={setTab} label="Onderdelen van het rijschool-pakket" />

      {tab === "overzicht" && <Overzicht data={data} naarTab={setTab} openLeerling={openLeerling} />}
      {tab === "agenda" && <AgendaTab data={data} doe={doe} />}
      {tab === "leerlingen" && <LeerlingenTab data={data} doe={doe} focus={leerlingFocus} onFocus={setLeerlingFocus} />}
      {tab === "betalingen" && <BetalingenTab data={data} openLeerling={openLeerling} />}
      {tab === "team" && <TeamTab data={data} doe={doe} />}
      {tab === "pakketten" && <PakkettenTab data={data} doe={doe} />}
      {tab === "website" && <WebsiteTab data={data} doe={doe} />}
      {tab === "instellingen" && <InstellingenTab data={data} doe={doe} />}
      {tab === "app" && <AppTab data={data} />}
    </div>
  );
}

function Aanzetten({ voorstel, onAan }: { voorstel: Voorstel; onAan: (d: BeheerWeergave) => void }) {
  const [v, setV] = useState(voorstel);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const zet = (k: keyof Voorstel) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function aan(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    try {
      onAan(await stuur<BeheerWeergave>("/api/rijschool/beheer", "POST", v));
    } catch (err) {
      setFout(foutVan(err));
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className="card mx-auto max-w-2xl p-6">
      <p className="eyebrow">Rijschool-pakket</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink">Alles voor je rijschool op één plek</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutralx-600">
        Een eigen website met proefles plannen, een app voor je leerlingen met hun lessen, voortgang en huiswerk, een instructeur-app om tijdens de les te
        beoordelen, pakketten en tegoed, en automatische mails. Daarbij houd je alles wat ZekerFlex al heeft: mail, telefonie en de AI-beller.
      </p>
      <ul className="mt-4 grid gap-2 text-sm text-ink sm:grid-cols-2">
        {["Website met proeflesplanner", "Leerling-app met leskaart", "Instructeur-app voor in de auto", "Pakketten, tegoed en betalingen", "Theorie oefenen met uitleg", "Bevestigingen per mail"].map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-xs text-brand-600" aria-hidden>
              ✓
            </span>
            {t}
          </li>
        ))}
      </ul>
      <form onSubmit={aan} className="mt-6 grid gap-4 sm:grid-cols-2">
        <Veld label="Naam van de rijschool">
          <input className="field-input" value={v.naam} onChange={zet("naam")} required minLength={2} maxLength={100} />
        </Veld>
        <Veld label="Plaats">
          <input className="field-input" value={v.plaats} onChange={zet("plaats")} maxLength={80} />
        </Veld>
        <Veld label="Telefoon">
          <input className="field-input" type="tel" value={v.telefoon} onChange={zet("telefoon")} maxLength={30} />
        </Veld>
        <Veld label="E-mail voor leerlingen">
          <input className="field-input" type="email" value={v.email} onChange={zet("email")} maxLength={200} />
        </Veld>
        <div className="sm:col-span-2">
          <Melding fout={fout} />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={bezig}>
            {bezig ? "Bezig…" : "Rijschool-pakket aanzetten"}
          </button>
          <p className="mt-2 text-xs text-neutralx-500">Je website staat pas online als je dat zelf aanzet. Tot die tijd zie alleen jij hem.</p>
        </div>
      </form>
    </section>
  );
}

function Overzicht({ data, naarTab, openLeerling }: { data: BeheerWeergave; naarTab: (t: TabId) => void; openLeerling: (id: string) => void }) {
  const actief = data.leerlingen.filter((l) => l.status === "ACTIEF").length;
  const aanmeldingen = data.leerlingen.filter((l) => l.status === "AANMELDING");
  const tekort = data.leerlingen.filter((l) => (l.status === "ACTIEF" || l.status === "AANMELDING") && l.saldoMin < 0).length;
  const maandStart = new Date();
  maandStart.setUTCDate(1);
  const dezeMaand = data.betalingen.filter((b) => b.status === "BETAALD" && b.betaaldOm && new Date(b.betaaldOm) >= maandStart).reduce((s, b) => s + b.bedragCent, 0);

  const stappen: { klaar: boolean; tekst: string; tab: TabId }[] = [
    { klaar: data.producten.length > 0, tekst: "Controleer je pakketten en prijzen (het zijn voorbeeldprijzen)", tab: "pakketten" },
    { klaar: data.instructeurs.some((i) => i.werktijden.length > 0), tekst: "Zet de werktijden van je instructeurs goed", tab: "team" },
    { klaar: data.voertuigen.length > 0, tekst: "Voeg je lesauto toe", tab: "team" },
    { klaar: data.rijschool.kvk !== "" && data.rijschool.adres !== "", tekst: "Vul je adres en KVK-nummer in (verplicht op je website)", tab: "instellingen" },
    { klaar: data.website.werkgebied.length > 0, tekst: "Vul je werkgebied en teksten in", tab: "website" },
    { klaar: data.rijschool.online, tekst: "Zet je website online", tab: "instellingen" },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-4">
        {[
          { label: "Actieve leerlingen", waarde: String(actief) },
          { label: "Nieuwe aanmeldingen", waarde: String(aanmeldingen.length) },
          { label: "Met tegoed tekort", waarde: String(tekort) },
          { label: "Ontvangen deze maand", waarde: euro(dezeMaand) },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-neutralx-500">{k.label}</p>
            <p className="num mt-1 font-display text-2xl font-bold text-ink">{k.waarde}</p>
          </div>
        ))}
      </div>

      <section className="card p-5 lg:col-span-2">
        <h2 className="font-display text-lg font-bold text-ink">Nieuwe aanmeldingen</h2>
        {aanmeldingen.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">Nog geen nieuwe aanmeldingen. Proeflessen die via je website binnenkomen, verschijnen hier.</p>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {aanmeldingen.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{l.naam}</span>
                  <span className="block truncate text-xs text-neutralx-500">
                    {LEERLING_STATUS_LABEL[l.status]} · {l.email}
                    {l.telefoon ? ` · ${l.telefoon}` : ""}
                  </span>
                </span>
                <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => openLeerling(l.id)}>
                  Openen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-lg font-bold text-ink">Zo zet je alles klaar</h2>
        <ol className="mt-3 space-y-2">
          {stappen.map((s) => (
            <li key={s.tekst}>
              <button type="button" onClick={() => naarTab(s.tab)} className="flex w-full items-start gap-2 text-left text-sm">
                <span
                  className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-xs ${s.klaar ? "bg-emerald-100 text-ok" : "bg-paper-soft text-neutralx-500 ring-1 ring-hair"}`}
                  aria-hidden
                >
                  {s.klaar ? "✓" : ""}
                </span>
                <span className={s.klaar ? "text-neutralx-500 line-through" : "text-ink hover:underline"}>{s.tekst}</span>
                <span className="sr-only">{s.klaar ? "(klaar)" : "(nog te doen)"}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
