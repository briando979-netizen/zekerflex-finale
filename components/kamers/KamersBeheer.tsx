"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KALENDER_DAGEN,
  SCHOON_NAAM,
  SCHOON_VOLGORDE,
  STATUS_NAAM,
  aankomstenOp,
  dagMaandKort,
  dagenVanaf,
  isDag,
  kalenderRij,
  nlDag,
  plusDagen,
  vertrekkenOp,
  weekdagKort,
  type Bezetting,
  type Boeking,
  type Kamer,
  type Schoon,
} from "@/lib/kamers/model";
import { BoekingPaneel } from "@/components/kamers/BoekingPaneel";
import { KamerFormulier } from "@/components/kamers/KamerFormulier";
import { euro, leesFout } from "@/components/kamers/hulp";

// Kamers en verblijven: de dag (aankomsten en vertrekken), een kalender van 14 dagen per kamer, de kamers met hun
// schoonmaakstatus en het maken en bewerken van boekingen. Boekingen voert het bedrijf hier zelf in.

const kaart = "rounded-xl border border-hair bg-white p-4";
const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500 disabled:opacity-40";
const schoonKlasse: Record<Schoon, string> = { schoon: "pill pill-ok", vuil: "pill pill-warn", "in-schoonmaak": "pill bg-plan-soft text-plan-ink" };
const celKlasse = { gereserveerd: "bg-plan-soft text-plan-ink", ingecheckt: "bg-mintwash text-ok", uitgecheckt: "bg-paper-soft text-neutralx-600" } as const;

type Paneel = { soort: "boeking"; id: string | null } | null;

export function KamersBeheer({ vandaag }: { vandaag: string }) {
  const [kamers, setKamers] = useState<Kamer[] | null>(null);
  const [boekingen, setBoekingen] = useState<Boeking[]>([]);
  const [teSchonen, setTeSchonen] = useState(0);
  const [start, setStart] = useState(vandaag);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [paneel, setPaneel] = useState<Paneel>(null);
  const [kamerForm, setKamerForm] = useState<string | "nieuw" | null>(null);
  const [metArchief, setMetArchief] = useState(false);
  const [bezetVan, setBezetVan] = useState(vandaag);
  const [bezetTot, setBezetTot] = useState(plusDagen(vandaag, 13));
  const [bezettingUitslag, setBezettingUitslag] = useState<Bezetting | null>(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    const van = start < vandaag ? start : vandaag;
    const eind = plusDagen(start, KALENDER_DAGEN);
    const morgen = plusDagen(vandaag, 1);
    const tot = eind > morgen ? eind : morgen;
    try {
      const res = await fetch(`/api/werkgever/kamers?van=${van}&tot=${tot}`, { cache: "no-store" });
      if (!res.ok) {
        setFout(await leesFout(res, "De kamers konden niet worden geladen. Vernieuw de pagina."));
        return;
      }
      const d = (await res.json()) as { kamers: Kamer[]; boekingen: Boeking[]; teSchonen: number };
      setFout(null);
      setKamers(d.kamers);
      setBoekingen(d.boekingen);
      setTeSchonen(d.teSchonen);
    } catch {
      setFout("De kamers konden niet worden geladen. Controleer je verbinding.");
    }
  }, [start, vandaag]);

  useEffect(() => {
    void laad();
  }, [laad]);

  /** Na een wijziging nemen we de teruggegeven versie van de server over, niet een lokaal bijgewerkt veld. */
  const vervangKamer = useCallback((k: Kamer) => setKamers((l) => (l ? (l.some((x) => x.id === k.id) ? l.map((x) => (x.id === k.id ? k : x)) : [...l, k].sort((a, b) => a.naam.localeCompare(b.naam, "nl", { numeric: true }))) : [k])), []);
  const vervangBoeking = useCallback((b: Boeking) => setBoekingen((l) => (l.some((x) => x.id === b.id) ? l.map((x) => (x.id === b.id ? b : x)) : [...l, b])), []);

  const dagen = useMemo(() => dagenVanaf(start, KALENDER_DAGEN), [start]);
  const kamerNaam = useCallback((id: string) => kamers?.find((k) => k.id === id)?.naam ?? "?", [kamers]);
  const actieve = useMemo(() => (kamers ?? []).filter((k) => !k.gearchiveerd), [kamers]);
  const aankomsten = useMemo(() => aankomstenOp(boekingen, vandaag), [boekingen, vandaag]);
  const vertrekken = useMemo(() => vertrekkenOp(boekingen, vandaag), [boekingen, vandaag]);
  const geopend = paneel?.id ? boekingen.find((b) => b.id === paneel.id) : undefined;

  async function patchKamer(body: Record<string, unknown>, standaard: string) {
    setFout(null);
    setMelding(null);
    const res = await fetch("/api/werkgever/kamers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      setFout(await leesFout(res, standaard));
      return;
    }
    vervangKamer(((await res.json()) as { kamer: Kamer }).kamer);
  }

  async function wisKamer(k: Kamer) {
    setFout(null);
    const res = await fetch(`/api/werkgever/kamers?id=${k.id}`, { method: "DELETE" });
    if (!res.ok) {
      setFout(await leesFout(res, "De kamer kon niet worden gewist."));
      return;
    }
    setKamers((l) => (l ? l.filter((x) => x.id !== k.id) : l));
  }

  async function rekenBezetting() {
    setFout(null);
    setBezettingUitslag(null);
    if (!isDag(bezetVan) || !isDag(bezetTot)) {
      setFout("Vul bij de bezetting een begin- en einddatum in.");
      return;
    }
    const res = await fetch(`/api/werkgever/kamers?modus=bezetting&van=${bezetVan}&tot=${bezetTot}`, { cache: "no-store" });
    if (!res.ok) {
      setFout(await leesFout(res, "De bezetting kon niet worden berekend."));
      return;
    }
    setBezettingUitslag(((await res.json()) as { bezetting: Bezetting }).bezetting);
  }

  async function opschonen() {
    setFout(null);
    setMelding(null);
    setBezig(true);
    try {
      const res = await fetch("/api/werkgever/kamers/boekingen", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "opschonen" }) });
      if (!res.ok) {
        setFout(await leesFout(res, "Het opschonen is niet gelukt."));
        return;
      }
      const { gewist } = (await res.json()) as { gewist: number };
      setMelding(`De gastgegevens van ${gewist} ${gewist === 1 ? "boeking" : "boekingen"} zijn gewist.`);
      await laad();
    } finally {
      setBezig(false);
    }
  }

  if (!kamers) {
    return fout ? (
      <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">Laden…</p>
    );
  }

  const zichtbareKamers = metArchief ? kamers : actieve;
  const gearchiveerd = kamers.length - actieve.length;

  const dagLijst = (titel: string, lijst: Boeking[], leeg: string) => (
    <div className={kaart}>
      <h2 className="font-display text-base font-bold text-ink">
        {titel} <span className="text-neutralx-500">({lijst.length})</span>
      </h2>
      {lijst.length === 0 ? (
        <p className="mt-2 text-sm text-neutralx-600">{leeg}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hair">
          {lijst.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-semibold text-ink">Kamer {kamerNaam(b.kamerId)}</span>
                <span className="text-neutralx-600">
                  {" "}
                  · {b.naam || "gast gewist"} · {b.personen} {b.personen === 1 ? "persoon" : "personen"}
                </span>
              </span>
              <button type="button" className={knopKlein} onClick={() => setPaneel({ soort: "boeking", id: b.id })}>
                Openen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-hair bg-brand-50 px-4 py-3 text-sm text-neutralx-600">
        Boekingen voer je hier zelf in: gasten kunnen niet online boeken. Er zijn ook geen betalingen, geen koppeling met een boekingssite en er wordt geen e-mail naar gasten gestuurd. Dit scherm houdt bij welke kamer wanneer bezet is, en
        voorkomt dubbele boekingen.
      </p>

      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      {melding && (
        <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok">
          {melding}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {dagLijst(`Aankomsten vandaag (${nlDag(vandaag)})`, aankomsten, "Er komt vandaag niemand aan die nog moet inchecken.")}
        {dagLijst("Vertrekken vandaag", vertrekken, "Er vertrekt vandaag niemand die nog moet uitchecken.")}
      </div>

      {paneel &&
        (paneel.id === null ? (
          <BoekingPaneel
            key="nieuw"
            kamers={kamers}
            vandaag={vandaag}
            opgeslagen={(b) => {
              vervangBoeking(b);
              setPaneel({ soort: "boeking", id: b.id });
            }}
            sluit={() => setPaneel(null)}
          />
        ) : geopend ? (
          <BoekingPaneel
            key={`${geopend.id}-${geopend.bijgewerktOp}`}
            kamers={kamers}
            begin={geopend}
            vandaag={vandaag}
            opgeslagen={(b, k) => {
              vervangBoeking(b);
              if (k) vervangKamer(k);
            }}
            sluit={() => setPaneel(null)}
          />
        ) : null)}

      <section aria-labelledby="kal-kop" className={kaart}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="kal-kop" className="font-display text-base font-bold text-ink">
            Kalender
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={knopKlein} onClick={() => setStart((s) => plusDagen(s, -KALENDER_DAGEN))}>
              ← Eerder
            </button>
            <button type="button" className={knopKlein} onClick={() => setStart(vandaag)}>
              Vandaag
            </button>
            <button type="button" className={knopKlein} onClick={() => setStart((s) => plusDagen(s, KALENDER_DAGEN))}>
              Later →
            </button>
            <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => setPaneel({ soort: "boeking", id: null })} disabled={actieve.length === 0}>
              Nieuwe boeking
            </button>
          </div>
        </div>
        {actieve.length === 0 ? (
          <p className="mt-3 text-sm text-neutralx-600">Voeg eerst een kamer toe (hieronder), dan kun je boekingen maken.</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-neutralx-600">
              Een gekleurd vak is een bezette nacht. Blauw is gereserveerd, groen is ingecheckt, grijs is uitgecheckt. Op de vertrekdag is de kamer weer vrij voor een nieuwe aankomst. Klik op een vak om de boeking te openen.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <caption className="sr-only">Bezetting per kamer, 14 dagen vanaf {nlDag(start)}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 bg-white px-2 py-1 text-left font-semibold text-neutralx-600">
                      Kamer
                    </th>
                    {dagen.map((d) => (
                      <th key={d} scope="col" className={`px-1 py-1 text-center font-semibold ${d === vandaag ? "text-brand-700" : "text-neutralx-600"}`}>
                        <span className="block">{weekdagKort(d)}</span>
                        <span className="block font-normal">{dagMaandKort(d)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actieve.map((k) => (
                    <tr key={k.id} className="border-t border-hair">
                      <th scope="row" className="sticky left-0 whitespace-nowrap bg-white px-2 py-1 text-left font-semibold text-ink">
                        {k.naam}
                      </th>
                      {kalenderRij(boekingen, k.id, dagen).map((c) => (
                        <td key={c.dag} className="p-0.5">
                          {c.boeking ? (
                            <button
                              type="button"
                              onClick={() => setPaneel({ soort: "boeking", id: c.boeking?.id ?? null })}
                              aria-label={`Kamer ${k.naam}, ${nlDag(c.dag)}: boeking ${c.boeking.nummer}, ${STATUS_NAAM[c.boeking.status].toLowerCase()}`}
                              className={`h-8 w-full overflow-hidden whitespace-nowrap rounded px-1 text-left ${c.boeking.status === "geannuleerd" ? "" : celKlasse[c.boeking.status]}`}
                            >
                              {c.begin ? c.boeking.naam || "gewist" : ""}
                            </button>
                          ) : (
                            <div className="h-8 w-full rounded border border-dashed border-hair" aria-hidden="true" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="bez-kop" className={kaart}>
        <h2 id="bez-kop" className="font-display text-base font-bold text-ink">
          Bezetting
        </h2>
        <p className="mt-1 text-sm text-neutralx-600">Het aantal bezette nachten van de actieve kamers, gedeeld door alle beschikbare nachten. Geannuleerde boekingen tellen niet mee. Hoogstens 31 dagen.</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="bez-van" className="field-label">
              Van
            </label>
            <input id="bez-van" type="date" className="field-input" value={bezetVan} onChange={(e) => setBezetVan(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bez-tot" className="field-label">
              Tot en met
            </label>
            <input id="bez-tot" type="date" className="field-input" value={bezetTot} onChange={(e) => setBezetTot(e.target.value)} />
          </div>
          <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => void rekenBezetting()}>
            Berekenen
          </button>
        </div>
        {bezettingUitslag && (
          <p className="mt-2 text-sm text-ink" aria-live="polite">
            <span className="text-2xl font-bold">{String(bezettingUitslag.procent).replace(".", ",")}%</span> bezet: {bezettingUitslag.bezet} van {bezettingUitslag.beschikbaar} kamer-nachten ({bezettingUitslag.dagen} dagen).
          </p>
        )}
      </section>

      <section aria-labelledby="kamers-kop" className={kaart}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="kamers-kop" className="font-display text-base font-bold text-ink">
            Kamers
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {gearchiveerd > 0 && (
              <label className="flex items-center gap-1.5 text-sm text-neutralx-600">
                <input type="checkbox" checked={metArchief} onChange={(e) => setMetArchief(e.target.checked)} />
                Gearchiveerde tonen ({gearchiveerd})
              </label>
            )}
            <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => setKamerForm("nieuw")}>
              Kamer toevoegen
            </button>
          </div>
        </div>
        {kamerForm === "nieuw" && (
          <div className="mt-3">
            <KamerFormulier
              opgeslagen={(k) => {
                vervangKamer(k);
                setKamerForm(null);
              }}
              annuleer={() => setKamerForm(null)}
            />
          </div>
        )}
        {zichtbareKamers.length === 0 && kamerForm !== "nieuw" && <p className="mt-3 text-sm text-neutralx-600">Je hebt nog geen kamers. Voeg je eerste kamer toe.</p>}
        <ul className="mt-3 divide-y divide-hair">
          {zichtbareKamers.map((k) => (
            <li key={k.id} className="py-3">
              {kamerForm === k.id ? (
                <KamerFormulier
                  begin={k}
                  opgeslagen={(n) => {
                    vervangKamer(n);
                    setKamerForm(null);
                  }}
                  annuleer={() => setKamerForm(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold text-ink">{k.naam}</span>
                      {k.gearchiveerd && <span className="ml-2 pill pill-neutral">Gearchiveerd</span>}
                      {!k.gearchiveerd && <span className={`ml-2 ${schoonKlasse[k.schoon]}`}>{SCHOON_NAAM[k.schoon]}</span>}
                    </p>
                    <p className="text-sm text-neutralx-600">
                      {k.type ? `${k.type} · ` : ""}tot {k.capaciteit} {k.capaciteit === 1 ? "persoon" : "personen"}
                      {k.prijsCent !== null ? ` · ${euro(k.prijsCent)} per nacht` : ""}
                    </p>
                    {k.notitie && <p className="text-xs text-neutralx-500">{k.notitie}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!k.gearchiveerd && (
                      <div role="group" aria-label={`Schoonmaakstatus van kamer ${k.naam}`} className="flex gap-1">
                        {SCHOON_VOLGORDE.map((s) => (
                          <button key={s} type="button" aria-pressed={k.schoon === s} disabled={k.schoon === s} className={`${knopKlein} ${k.schoon === s ? "bg-paper-soft" : ""}`} onClick={() => void patchKamer({ id: k.id, actie: "schoon", schoon: s }, "De schoonmaakstatus kon niet worden gewijzigd.")}>
                            {SCHOON_NAAM[s]}
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button" className={knopKlein} onClick={() => setKamerForm(k.id)}>
                      Bewerken
                    </button>
                    <button type="button" className={knopKlein} onClick={() => void patchKamer({ id: k.id, actie: k.gearchiveerd ? "terughalen" : "archiveren" }, "De kamer kon niet worden gearchiveerd.")}>
                      {k.gearchiveerd ? "Terughalen" : "Archiveren"}
                    </button>
                    {!boekingen.some((b) => b.kamerId === k.id) && (
                      <button type="button" className={knopKlein} onClick={() => void wisKamer(k)}>
                        Wissen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-neutralx-500">Wissen kan alleen een kamer zonder boekingen; anders archiveer je hem. Een kamer met een boeking die nog niet voorbij is, kan niet worden gearchiveerd.</p>
      </section>

      <section aria-labelledby="privacy-kop" className={kaart}>
        <h2 id="privacy-kop" className="font-display text-base font-bold text-ink">
          Gastgegevens en bewaartermijn
        </h2>
        <p className="mt-1 text-sm text-neutralx-600">
          Gasten zijn derden: je bewaart hun naam, telefoon en e-mail niet langer dan nodig. Bij elke boeking kun je de gastgegevens wissen. Boekingen die langer dan twee jaar geleden zijn uitgecheckt, horen hun gastgegevens niet meer te
          hebben; wissen kan hieronder in één keer. De lege regel blijft staan, zodat de bezetting klopt.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink">
            {teSchonen === 0 ? "Er zijn geen boekingen die aan de bewaartermijn toe zijn." : `${teSchonen} ${teSchonen === 1 ? "boeking is" : "boekingen zijn"} aan de bewaartermijn toe.`}
          </p>
          {teSchonen > 0 && (
            <button type="button" disabled={bezig} className={knopKlein} onClick={() => void opschonen()}>
              Gastgegevens van deze boekingen wissen
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
