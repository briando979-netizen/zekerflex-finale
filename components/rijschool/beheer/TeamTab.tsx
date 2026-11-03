"use client";

import { useState } from "react";
import type { BeheerWeergave, InstructeurRij, VoertuigRij } from "@/lib/rijschool/weergave";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import { foutVan } from "@/components/rijschool/api";
import { Melding, Schakelaar, Veld } from "@/components/rijschool/ui";
import { DAGNAMEN, type Werktijd } from "@/lib/rijschool/planning";

// Instructeurs (met vaste werktijden: daaruit komen de vrije tijden voor
// proeflessen en zelf plannen) en de lesauto's.

const CATEGORIEEN = ["AM", "A", "B", "BE", "C", "CE", "D"] as const;
type Categorie = (typeof CATEGORIEEN)[number];

const NIEUWE_INSTRUCTEUR: Omit<InstructeurRij, "id" | "heeftWachtwoord" | "uitnodigingOpen"> = {
  naam: "",
  email: "",
  telefoon: "",
  bio: "",
  categorieen: ["B"],
  werktijden: [1, 2, 3, 4, 5].map((dag) => ({ dag, van: "08:00", tot: "18:00" })),
  kleur: "#2F6F73",
  actief: true,
};

export function TeamTab({ data, doe }: { data: BeheerWeergave; doe: Doe }) {
  const [bewerk, setBewerk] = useState<InstructeurRij | "nieuw" | null>(null);
  const [auto, setAuto] = useState<VoertuigRij | "nieuw" | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Instructeurs</h2>
          <button type="button" className="btn-primary" onClick={() => setBewerk("nieuw")}>
            Instructeur toevoegen
          </button>
        </div>
        {bewerk && (
          <InstructeurFormulier
            key={bewerk === "nieuw" ? "nieuw" : bewerk.id}
            doe={doe}
            instructeur={bewerk === "nieuw" ? null : bewerk}
            onKlaar={() => setBewerk(null)}
          />
        )}
        <ul className="card divide-y divide-hair">
          {data.instructeurs.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-4">
              <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: i.kleur }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">
                  {i.naam} {!i.actief && <span className="pill-neutral ml-1">Uit</span>}
                </span>
                <span className="block truncate text-xs text-neutralx-500">
                  {i.categorieen.join(", ")} · {i.werktijden.length === 0 ? "geen werktijden" : i.werktijden.map((w) => (DAGNAMEN[w.dag - 1] ?? "").slice(0, 2)).join(" ")} ·{" "}
                  {i.heeftWachtwoord ? "app in gebruik" : i.uitnodigingOpen ? "uitgenodigd" : "nog geen account"}
                </span>
              </span>
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setBewerk(i)}>
                Bewerken
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutralx-500">
          Geef je zelf les? Dan kom je in de instructeur-app binnen met je ZekerFlex-login, zolang hier een instructeur met jouw e-mailadres staat.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Lesauto&apos;s</h2>
          <button type="button" className="btn-primary" onClick={() => setAuto("nieuw")}>
            Auto toevoegen
          </button>
        </div>
        {auto && <VoertuigFormulier key={auto === "nieuw" ? "nieuw" : auto.id} doe={doe} voertuig={auto === "nieuw" ? null : auto} onKlaar={() => setAuto(null)} />}
        {data.voertuigen.length === 0 ? (
          <p className="card p-4 text-sm text-neutralx-600">Nog geen auto&apos;s. Met een auto erbij voorkomt de agenda dat hij twee keer tegelijk wordt ingepland.</p>
        ) : (
          <ul className="card divide-y divide-hair">
            {data.voertuigen.map((v) => (
              <li key={v.id} className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {v.naam} {!v.actief && <span className="pill-neutral ml-1">Uit</span>}
                  </span>
                  <span className="block truncate text-xs text-neutralx-500">
                    {v.kenteken || "geen kenteken"} · {v.automaat ? "automaat" : "handgeschakeld"} · {v.categorie}
                  </span>
                </span>
                <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setAuto(v)}>
                  Bewerken
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InstructeurFormulier({ doe, instructeur, onKlaar }: { doe: Doe; instructeur: InstructeurRij | null; onKlaar: () => void }) {
  const [v, setV] = useState(instructeur ?? NIEUWE_INSTRUCTEUR);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const werktijdVan = (dag: number) => v.werktijden.find((w) => w.dag === dag);
  function zetDag(dag: number, w: Werktijd | null) {
    const rest = v.werktijden.filter((x) => x.dag !== dag);
    setV({ ...v, werktijden: (w ? [...rest, w] : rest).sort((a, b) => a.dag - b.dag) });
  }
  function wisselCategorie(c: Categorie) {
    const heeft = v.categorieen.includes(c);
    setV({ ...v, categorieen: heeft ? v.categorieen.filter((x) => x !== c) : [...v.categorieen, c] });
  }

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    try {
      await doe({
        actie: "instructeur",
        id: instructeur?.id ?? null,
        data: {
          naam: v.naam,
          email: v.email,
          telefoon: v.telefoon,
          bio: v.bio,
          categorieen: v.categorieen as Categorie[],
          werktijden: v.werktijden,
          kleur: v.kleur,
          actief: v.actief,
        },
      });
      onKlaar();
    } catch (err) {
      setFout(foutVan(err));
    } finally {
      setBezig(false);
    }
  }

  async function nodigUit() {
    if (!instructeur) return;
    setFout(null);
    try {
      const r = await doe({ actie: "uitnodigen", soort: "instructeur", id: instructeur.id });
      setOk(r.verstuurd ? `Uitnodiging gestuurd naar ${instructeur.email}.` : "De uitnodiging is klaargezet, maar de mail kon niet worden verstuurd.");
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  return (
    <form onSubmit={bewaar} className="card grid gap-4 p-5 sm:grid-cols-2">
      <Veld label="Naam">
        <input className="field-input" value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} required minLength={2} maxLength={100} />
      </Veld>
      <Veld label="E-mail (om in te loggen)">
        <input className="field-input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required maxLength={200} />
      </Veld>
      <Veld label="Telefoon">
        <input className="field-input" type="tel" value={v.telefoon} onChange={(e) => setV({ ...v, telefoon: e.target.value })} maxLength={30} />
      </Veld>
      <Veld label="Kleur in de agenda">
        <input className="field-input h-11 p-1" type="color" value={v.kleur} onChange={(e) => setV({ ...v, kleur: e.target.value })} />
      </Veld>
      <div className="sm:col-span-2">
        <Veld label="Over deze instructeur (op de website)">
          <textarea className="field-input min-h-[4rem]" value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} maxLength={600} />
        </Veld>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="field-label">Rijbewijscategorieën</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {CATEGORIEEN.map((c) => (
            <label key={c} className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${v.categorieen.includes(c) ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-hair"}`}>
              <input type="checkbox" className="sr-only" checked={v.categorieen.includes(c)} onChange={() => wisselCategorie(c)} />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="field-label">Vaste werktijden</legend>
        <div className="mt-1.5 space-y-2">
          {DAGNAMEN.map((naam, idx) => {
            const dag = idx + 1;
            const w = werktijdVan(dag);
            return (
              <div key={naam} className="flex flex-wrap items-center gap-2">
                <label className="flex w-32 items-center gap-2 text-sm capitalize text-ink">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={Boolean(w)} onChange={(e) => zetDag(dag, e.target.checked ? { dag, van: "08:00", tot: "18:00" } : null)} />
                  {naam}
                </label>
                {w && (
                  <>
                    <input className="field-input !mt-0 w-28" type="time" step={900} value={w.van} onChange={(e) => zetDag(dag, { ...w, van: e.target.value })} aria-label={`${naam} van`} />
                    <span className="text-sm text-neutralx-500">tot</span>
                    <input className="field-input !mt-0 w-28" type="time" step={900} value={w.tot} onChange={(e) => zetDag(dag, { ...w, tot: e.target.value })} aria-label={`${naam} tot`} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <Schakelaar label="Actief" uitleg="Een instructeur die uit staat, krijgt geen nieuwe lessen en kan niet inloggen." aan={v.actief} onChange={(actief) => setV({ ...v, actief })} />
      </div>
      <div className="sm:col-span-2">
        <Melding fout={fout} ok={ok} />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={bezig}>
          {bezig ? "Bezig…" : "Opslaan"}
        </button>
        {instructeur && (
          <button type="button" className="btn-ghost" onClick={nodigUit}>
            {instructeur.heeftWachtwoord ? "Nieuwe inloglink sturen" : "Uitnodigen voor de app"}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onKlaar}>
          Sluiten
        </button>
      </div>
    </form>
  );
}

function VoertuigFormulier({ doe, voertuig, onKlaar }: { doe: Doe; voertuig: VoertuigRij | null; onKlaar: () => void }) {
  const [v, setV] = useState(voertuig ?? { naam: "", kenteken: "", automaat: false, categorie: "B", actief: true });
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    try {
      await doe({
        actie: "voertuig",
        id: voertuig?.id ?? null,
        data: { naam: v.naam, kenteken: v.kenteken.toUpperCase(), automaat: v.automaat, categorie: v.categorie as Categorie, actief: v.actief },
      });
      onKlaar();
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  async function weg() {
    if (!voertuig || !window.confirm(`${voertuig.naam} verwijderen? Geplande lessen blijven staan, zonder auto.`)) return;
    try {
      await doe({ actie: "voertuigWeg", id: voertuig.id });
      onKlaar();
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  return (
    <form onSubmit={bewaar} className="card grid gap-4 p-5 sm:grid-cols-2">
      <Veld label="Merk en model">
        <input className="field-input" value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} required minLength={2} maxLength={80} placeholder="Volkswagen Golf" />
      </Veld>
      <Veld label="Kenteken">
        <input className="field-input uppercase" value={v.kenteken} onChange={(e) => setV({ ...v, kenteken: e.target.value })} maxLength={12} />
      </Veld>
      <Veld label="Categorie">
        <select className="field-input" value={v.categorie} onChange={(e) => setV({ ...v, categorie: e.target.value })}>
          {CATEGORIEEN.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Veld>
      <div className="space-y-2">
        <Schakelaar label="Automaat" aan={v.automaat} onChange={(automaat) => setV({ ...v, automaat })} />
        <Schakelaar label="In gebruik" aan={v.actief} onChange={(actief) => setV({ ...v, actief })} />
      </div>
      <div className="sm:col-span-2">
        <Melding fout={fout} />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary">
          Opslaan
        </button>
        {voertuig && (
          <button type="button" className="btn-ghost text-crit" onClick={weg}>
            Verwijderen
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onKlaar}>
          Sluiten
        </button>
      </div>
    </form>
  );
}
