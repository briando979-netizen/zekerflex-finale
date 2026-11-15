"use client";

import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { analyseer, roosterRijen, type Analyse } from "@/lib/inkaart/analyse";
import {
  nieuweGroep,
  nieuweRuimte,
  getalOfNull,
  kopieerBezettingNaarAlle,
  procentOfNull,
  vulOpenDagdelen,
  wijzigGroep,
  wijzigRuimte,
  zetBezetting,
  zetOpen,
} from "@/lib/inkaart/bewerk";
import {
  DAGDELEN,
  DAGDEEL_TIJD,
  DAGEN,
  DAG_NAAM,
  MAX_GROEPEN,
  MAX_RUIMTE_REGELS,
  SOORTEN,
  plekNaam,
  type BedrijfInKaart,
  type Soort,
} from "@/lib/inkaart/model";
import { VOORBEELDEN, voorbeeldRegels } from "@/lib/inkaart/sjablonen";

// ---------------------------------------------------------------------------
// Bedrijf in kaart (lib/inkaart): vijf tabbladen. Resultaat laat zien wat uit de ingevulde gegevens volgt (live berekend in de browser met
// lib/inkaart/analyse.ts), de andere vier zijn om in te vullen: Gegevens (kosten, doelen, openingstijden), Personeel, Ruimtes en Bezetting.
// Bewaren gaat naar /api/werkgever/in-kaart; het scherm neemt de bewaarde versie van de server over.
// ---------------------------------------------------------------------------

type Tab = "resultaat" | "gegevens" | "personeel" | "ruimtes" | "bezetting";
const TABS: { sleutel: Tab; naam: string }[] = [
  { sleutel: "resultaat", naam: "Resultaat" },
  { sleutel: "gegevens", naam: "Gegevens" },
  { sleutel: "personeel", naam: "Personeel" },
  { sleutel: "ruimtes", naam: "Ruimtes" },
  { sleutel: "bezetting", naam: "Bezetting" },
];

const euro = (n: number | null) => (n === null ? "–" : `€ ${Math.round(n).toLocaleString("nl-NL")}`);
const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

export function InKaart({ start, magWijzigen }: { start: BedrijfInKaart; magWijzigen: boolean }) {
  const [b, setB] = useState<BedrijfInKaart>(start);
  const [tab, setTab] = useState<Tab>("resultaat");
  const [vers, setVers] = useState(0);
  const [bezig, setBezig] = useState(false);
  const [gewijzigd, setGewijzigd] = useState(false);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const analyse = useMemo(() => analyseer(b), [b]);

  const wijzig = (volgende: BedrijfInKaart) => {
    setB(volgende);
    setGewijzigd(true);
    setMelding(null);
  };

  async function bewaar() {
    setBezig(true);
    setMelding(null);
    try {
      const res = await fetch("/api/werkgever/in-kaart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      const data = (await res.json().catch(() => ({}))) as { bedrijf?: BedrijfInKaart; error?: { message?: string } };
      if (!res.ok || !data.bedrijf) throw new Error(data.error?.message ?? "Bewaren lukte niet. Probeer het zo nog eens.");
      // de bewaarde versie van de server overnemen (met het tijdstip), niet onze eigen kopie
      setB(data.bedrijf);
      setVers((v) => v + 1);
      setGewijzigd(false);
      setMelding({ soort: "ok", tekst: "Bewaard." });
    } catch (err) {
      setMelding({ soort: "fout", tekst: err instanceof Error ? err.message : "Bewaren lukte niet." });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-6">
      <Voortgang volledigheid={analyse.volledigheid} />

      <div role="tablist" aria-label="Onderdelen van Bedrijf in kaart" className="flex flex-wrap gap-1 border-b border-hair">
        {TABS.map((t) => (
          <button
            key={t.sleutel}
            type="button"
            role="tab"
            id={`inkaart-tab-${t.sleutel}`}
            aria-selected={tab === t.sleutel}
            aria-controls={`inkaart-paneel-${t.sleutel}`}
            onClick={() => setTab(t.sleutel)}
            className={`min-h-[44px] rounded-t-lg px-4 text-sm font-semibold transition ${tab === t.sleutel ? "border-b-2 border-brand-500 text-ink" : "text-neutralx-500 hover:text-ink"}`}
          >
            {t.naam}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`inkaart-paneel-${tab}`} aria-labelledby={`inkaart-tab-${tab}`} key={`${tab}-${vers}`}>
        {tab === "resultaat" && <ResultaatTab b={b} a={analyse} naarTab={setTab} />}
        {tab === "gegevens" && <GegevensTab b={b} wijzig={wijzig} bewerkbaar={magWijzigen} naarTab={setTab} />}
        {tab === "personeel" && <PersoneelTab b={b} wijzig={wijzig} bewerkbaar={magWijzigen} />}
        {tab === "ruimtes" && <RuimtesTab b={b} wijzig={wijzig} bewerkbaar={magWijzigen} />}
        {tab === "bezetting" && <BezettingTab b={b} wijzig={wijzig} bewerkbaar={magWijzigen} />}
      </div>

      {magWijzigen ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-hair bg-white/95 px-4 py-3 backdrop-blur lg:mx-0 lg:rounded-xl lg:border">
          <button type="button" onClick={() => void bewaar()} disabled={bezig || !gewijzigd} className="btn-primary min-h-[44px]">
            {bezig ? "Bewaren…" : "Bewaren"}
          </button>
          <span className="text-sm text-neutralx-500">{gewijzigd ? "Je hebt wijzigingen die nog niet bewaard zijn." : "Alles is bewaard."}</span>
          {melding && (
            <span role={melding.soort === "fout" ? "alert" : "status"} className={`text-sm font-medium ${melding.soort === "fout" ? "text-crit" : "text-brand-600"}`}>
              {melding.tekst}
            </span>
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-600">Je kunt deze gegevens bekijken. Een beheerder of lokale manager past ze aan.</p>
      )}
    </div>
  );
}

function Voortgang({ volledigheid }: { volledigheid: number }) {
  return (
    <div className="rounded-2xl border border-hair bg-white p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">Hoe compleet is je beeld?</span>
        <span className="num text-neutralx-600">{volledigheid}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-soft" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={volledigheid} aria-label="Volledigheid van de ingevulde gegevens">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${volledigheid}%` }} />
      </div>
      <p className="mt-2 text-xs text-neutralx-500">Een schatting is genoeg. Hoe meer je invult, hoe preciezer wat we kunnen zeggen.</p>
    </div>
  );
}

// ---- resultaat -------------------------------------------------------------

function Kaart({ titel, waarde, uitleg }: { titel: string; waarde: string; uitleg?: string | undefined }) {
  return (
    <div className="rounded-2xl border border-hair bg-white p-4">
      <p className="text-xs font-medium text-neutralx-500">{titel}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">{waarde}</p>
      {uitleg && <p className="mt-1 text-xs text-neutralx-500">{uitleg}</p>}
    </div>
  );
}

function ResultaatTab({ b, a, naarTab }: { b: BedrijfInKaart; a: Analyse; naarTab: (t: Tab) => void }) {
  const leeg = b.ruimtes.length === 0 && b.groepen.length === 0 && b.omzetJaar === null;
  if (leeg) {
    return (
      <div className="rounded-2xl border border-hair bg-white p-6 text-center">
        <p className="font-display text-lg font-bold text-ink">Begin met je soort bedrijf</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-neutralx-600">
          Kies bij Gegevens wat voor bedrijf je hebt en laad een voorbeeldset: dan staan de ruimtes en groepen personeel die erbij horen er al in. Jij vult de aantallen en cijfers in; wij rekenen uit wat eruit volgt.
        </p>
        <button type="button" onClick={() => naarTab("gegevens")} className="btn-primary mt-4 min-h-[44px]">
          Naar Gegevens
        </button>
      </div>
    );
  }
  const f = a.financieel;
  return (
    <div className="space-y-8">
      <section aria-label="Kerncijfers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kaart titel="Personeelskosten, % van de omzet" waarde={pct(f.personeelPct)} uitleg={f.personeelskosten !== null ? `${euro(f.personeelskosten)} per jaar${b.doelPersoneelPct !== null ? `, doel ${b.doelPersoneelPct}%` : ""}` : "Vul personeel en omzet in"} />
        <Kaart titel="Kosten per fte" waarde={euro(f.kostenPerFte)} uitleg={f.fte > 0 ? `${f.fte} fte` : "Vul bij Personeel de fte in"} />
        <Kaart titel="Ruimtes" waarde={String(a.ruimtes.aantal)} uitleg={a.ruimtes.m2Totaal !== null ? `${a.ruimtes.m2Totaal.toLocaleString("nl-NL")} m² samen` : "Vul de oppervlakte in voor m²"} />
        <Kaart titel="Gemiddelde bezetting" waarde={pct(a.bezetting.gemiddeld)} uitleg={a.bezetting.gemiddeld !== null ? `over de open dagdelen, ${a.bezetting.ruimtesMetGegevens} ruimtesoort(en) ingevuld` : "Vul bij Bezetting de drukte in"} />
      </section>

      {(f.huurPct !== null || a.ruimtes.m2PerFte !== null || f.omzetPerFte !== null) && (
        <section aria-label="Meer cijfers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kaart titel="Omzet per fte" waarde={euro(f.omzetPerFte)} />
          <Kaart titel="Huur, % van de omzet" waarde={pct(f.huurPct)} />
          <Kaart titel="Omzet per m²" waarde={euro(f.omzetPerM2)} />
          <Kaart titel="m² per fte" waarde={a.ruimtes.m2PerFte === null ? "–" : String(a.ruimtes.m2PerFte)} />
        </section>
      )}

      <section aria-labelledby="inkaart-signalen">
        <h2 id="inkaart-signalen" className="font-display text-xl font-bold text-ink">
          Wat valt op
        </h2>
        {a.signalen.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">Nog niets bijzonders. Vul meer in, dan kijken we mee.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {a.signalen.map((s) => (
              <li key={s.id} className={`rounded-2xl border p-4 ${s.niveau === "aandacht" ? "border-warn/40 bg-warn/5" : "border-hair bg-white"}`}>
                <p className="text-sm font-semibold text-ink">
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${s.niveau === "aandacht" ? "bg-warn/20 text-ink" : "bg-paper-soft text-neutralx-600"}`}>
                    {s.niveau === "aandacht" ? "Aandacht" : "Info"}
                  </span>
                  {s.titel}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{s.waarom}</p>
                {s.actie && (
                  <Link href={s.actie.href} className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
                    {s.actie.label} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="inkaart-rooster">
        <h2 id="inkaart-rooster" className="font-display text-xl font-bold text-ink">
          Wanneer is het druk
        </h2>
        <p className="mt-1 text-sm text-neutralx-600">Gemiddelde bezetting van al je ruimtes per dagdeel. Donkerder is drukker; een streepje betekent gesloten of niet ingevuld.</p>
        <RoosterTabel raster={a.bezetting.raster} />
        {a.bezetting.piek && a.bezetting.dal && (
          <p className="mt-2 text-sm text-neutralx-600">
            Het drukste moment is <strong>{plekNaam(a.bezetting.piek.index)}</strong> ({a.bezetting.piek.pct}%), het rustigste <strong>{plekNaam(a.bezetting.dal.index)}</strong> ({a.bezetting.dal.pct}%).
          </p>
        )}
      </section>

      {a.perRuimte.length > 0 && (
        <section aria-labelledby="inkaart-ruimtes">
          <h2 id="inkaart-ruimtes" className="font-display text-xl font-bold text-ink">
            Per ruimte
          </h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-hair bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">Bezetting en capaciteit per ruimte</caption>
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Ruimte</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Aantal</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Gem. bezet</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Nodig bij piek</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Leeg bij piek</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Uren leeg per week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {a.perRuimte.map((u) => (
                  <tr key={u.id}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink">{u.naam}</th>
                    <td className="num px-4 py-2.5 text-right">{u.aantal}</td>
                    <td className="num px-4 py-2.5 text-right">{pct(u.gemiddeld)}</td>
                    <td className="num px-4 py-2.5 text-right">{u.nodigBijPiek ?? "–"}</td>
                    <td className="num px-4 py-2.5 text-right">{u.leegBijPiek ?? "–"}</td>
                    <td className="num px-4 py-2.5 text-right">{u.ongebruiktUrenPerWeek ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutralx-500">Alles hierboven komt uit wat je zelf invulde; we vergelijken niet met andere bedrijven.</p>
        </section>
      )}
    </div>
  );
}

function RoosterTabel({ raster }: { raster: (number | null)[] }) {
  const rijen = roosterRijen(raster);
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-hair bg-white p-3">
      <table className="w-full min-w-[320px] text-sm">
        <caption className="sr-only">Gemiddelde bezetting per dag en dagdeel</caption>
        <thead>
          <tr className="text-xs text-neutralx-500">
            <td />
            {DAGDELEN.map((d) => (
              <th key={d} scope="col" className="px-1 py-1.5 text-center font-medium">
                {d}
                <span className="block text-[10px] font-normal">{DAGDEEL_TIJD[d]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={r.dag}>
              <th scope="row" className="py-1 pr-2 text-left text-xs font-medium text-neutralx-600">{DAG_NAAM[r.dag]}</th>
              {r.waarden.map((w, k) => (
                <td key={k} className="p-1">
                  <div
                    className="num grid h-10 place-items-center rounded-lg text-xs font-semibold text-ink"
                    style={{ background: w === null ? "transparent" : `rgba(var(--brand-500-rgb), ${0.08 + (w / 100) * 0.55})`, border: w === null ? "1px dashed var(--hair, #d9ddd9)" : "none" }}
                    title={w === null ? "gesloten of niet ingevuld" : `${w}% bezet`}
                  >
                    {w === null ? "–" : `${w}%`}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- invoervelden ----------------------------------------------------------

function Veld({ label, uitleg, children, id }: { label: string; uitleg?: string | undefined; children: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {uitleg && <p className="mt-1 text-xs text-neutralx-500">{uitleg}</p>}
    </div>
  );
}

const invoerKlasse = "mt-1 w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:bg-paper-soft";

/** Een getalveld dat eigen tekst bijhoudt (zodat "12," typen kan) en pas een getal doorgeeft als het er een is. */
function GetalVeld({ label, uitleg, waarde, naar, bewerkbaar, eenheid, procent = false }: { label: string; uitleg?: string | undefined; waarde: number | null; naar: (n: number | null) => void; bewerkbaar: boolean; eenheid?: string | undefined; procent?: boolean }) {
  const id = useId();
  const [tekst, setTekst] = useState(waarde === null ? "" : String(waarde).replace(".", ","));
  return (
    <Veld label={eenheid ? `${label} (${eenheid})` : label} uitleg={uitleg} id={id}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={tekst}
        disabled={!bewerkbaar}
        onChange={(e) => {
          setTekst(e.target.value);
          naar(procent ? procentOfNull(e.target.value) : getalOfNull(e.target.value));
        }}
        className={invoerKlasse}
      />
    </Veld>
  );
}

function TekstVeld({ label, uitleg, waarde, naar, bewerkbaar, max = 80 }: { label: string; uitleg?: string | undefined; waarde: string; naar: (t: string) => void; bewerkbaar: boolean; max?: number }) {
  const id = useId();
  return (
    <Veld label={label} uitleg={uitleg} id={id}>
      <input id={id} type="text" value={waarde} maxLength={max} disabled={!bewerkbaar} onChange={(e) => naar(e.target.value)} className={invoerKlasse} />
    </Veld>
  );
}

// ---- gegevens --------------------------------------------------------------

function GegevensTab({ b, wijzig, bewerkbaar, naarTab }: { b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean; naarTab: (t: Tab) => void }) {
  const soortId = useId();
  const [bevestig, setBevestig] = useState(false);
  const heeftRegels = b.ruimtes.length > 0 || b.groepen.length > 0;

  function laadVoorbeeld() {
    const r = voorbeeldRegels(b.soort);
    wijzig({ ...b, groepen: r.groepen, ruimtes: r.ruimtes, open: r.open });
    setBevestig(false);
    naarTab("ruimtes");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-bold text-ink">Wat voor bedrijf is het?</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Veld label="Soort bedrijf" id={soortId} uitleg="Hiermee vullen we de namen van de ruimtes en de groepen personeel alvast in. De aantallen en cijfers vul jij in.">
            <select id={soortId} value={b.soort} disabled={!bewerkbaar} onChange={(e) => wijzig({ ...b, soort: e.target.value as Soort })} className={invoerKlasse}>
              {SOORTEN.map((s) => (
                <option key={s} value={s}>
                  {VOORBEELDEN[s].naam}
                </option>
              ))}
            </select>
          </Veld>
          <GetalVeld label="Over welk jaar gaan de cijfers?" waarde={b.jaar} naar={(n) => wijzig({ ...b, jaar: n !== null && n >= 2000 && n <= 2100 ? Math.round(n) : b.jaar })} bewerkbaar={bewerkbaar} />
        </div>
        {bewerkbaar && b.soort !== "overig" && (
          <div className="mt-4">
            {!bevestig ? (
              <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => (heeftRegels ? setBevestig(true) : laadVoorbeeld())}>
                Voorbeeldset laden voor {VOORBEELDEN[b.soort].naam.toLowerCase()}
              </button>
            ) : (
              <div role="alert" className="rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm">
                <p className="text-ink">Dit vervangt je huidige ruimtes en groepen personeel door de namen uit de voorbeeldset. Je ingevulde aantallen en bezetting gaan verloren. Doorgaan?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary min-h-[44px] text-sm" onClick={laadVoorbeeld}>
                    Ja, vervangen
                  </button>
                  <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => setBevestig(false)}>
                    Nee, laat het zoals het is
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-bold text-ink">Geld</h2>
        <p className="mt-1 text-sm text-neutralx-600">Per jaar, in hele euro. Een schatting is genoeg.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <GetalVeld label="Omzet of budget" eenheid="€ per jaar" waarde={b.omzetJaar} naar={(n) => wijzig({ ...b, omzetJaar: n })} bewerkbaar={bewerkbaar} />
          <GetalVeld label="Totale personeelskosten" eenheid="€ per jaar" uitleg="Alleen als je ze niet per groep bij Personeel invult. Neem de werkgeverslasten mee." waarde={b.personeelskostenJaar} naar={(n) => wijzig({ ...b, personeelskostenJaar: n })} bewerkbaar={bewerkbaar} />
          <GetalVeld label="Huur van de ruimtes" eenheid="€ per jaar" waarde={b.huurJaar} naar={(n) => wijzig({ ...b, huurJaar: n })} bewerkbaar={bewerkbaar} />
        </div>
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-bold text-ink">Je eigen doelen</h2>
        <p className="mt-1 text-sm text-neutralx-600">Waar wil je naartoe? We vergelijken met je eigen doel, niet met andere bedrijven. Leeg laten mag.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <GetalVeld label="Doel voor personeelskosten" eenheid="% van de omzet" procent waarde={b.doelPersoneelPct} naar={(n) => wijzig({ ...b, doelPersoneelPct: n })} bewerkbaar={bewerkbaar} />
          <GetalVeld label="Doel voor bezetting van ruimtes" eenheid="% bezet" procent uitleg="Ruimtes die gemiddeld lager zitten, krijgen een signaal. Zonder doel gebruiken we 40%." waarde={b.doelBezettingPct} naar={(n) => wijzig({ ...b, doelBezettingPct: n })} bewerkbaar={bewerkbaar} />
        </div>
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-bold text-ink">Wanneer ben je open?</h2>
        <p className="mt-1 text-sm text-neutralx-600">Vink de dagdelen aan waarin je ruimtes in gebruik zijn. Alleen die tellen mee in de bezetting.</p>
        <OpenTijden b={b} wijzig={wijzig} bewerkbaar={bewerkbaar} />
      </section>
    </div>
  );
}

function OpenTijden({ b, wijzig, bewerkbaar }: { b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[320px] text-sm">
        <caption className="sr-only">Open dagdelen per dag</caption>
        <thead>
          <tr className="text-xs text-neutralx-500">
            <td />
            {DAGDELEN.map((d) => (
              <th key={d} scope="col" className="px-1 py-1.5 text-center font-medium">
                {d}
                <span className="block text-[10px] font-normal">{DAGDEEL_TIJD[d]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAGEN.map((dag, d) => (
            <tr key={dag}>
              <th scope="row" className="py-1 pr-2 text-left text-xs font-medium text-neutralx-600">{DAG_NAAM[dag]}</th>
              {DAGDELEN.map((deel, k) => {
                const index = d * DAGDELEN.length + k;
                return (
                  <td key={deel} className="p-1 text-center">
                    <label className="inline-grid h-11 w-11 cursor-pointer place-items-center">
                      <input type="checkbox" className="h-5 w-5" checked={b.open[index] === true} disabled={!bewerkbaar} onChange={(e) => wijzig(zetOpen(b, index, e.target.checked))} aria-label={`${DAG_NAAM[dag]} ${deel} open`} />
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- personeel -------------------------------------------------------------

function PersoneelTab({ b, wijzig, bewerkbaar }: { b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutralx-600">Groepen personeel met hun fte (voltijdsequivalenten) en wat ze per jaar kosten, werkgeverslasten inbegrepen. Weet je alleen het totaal? Vul dat bij Gegevens in.</p>
      <ul className="space-y-3">
        {b.groepen.map((g) => (
          <li key={g.id} className="rounded-2xl border border-hair bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <TekstVeld label="Groep" waarde={g.naam} naar={(t) => wijzig(wijzigGroep(b, g.id, { naam: t }))} bewerkbaar={bewerkbaar} />
              <GetalVeld label="Aantal fte" waarde={g.fte} naar={(n) => wijzig(wijzigGroep(b, g.id, { fte: n !== null && n >= 0 ? n : 0 }))} bewerkbaar={bewerkbaar} />
              <GetalVeld label="Kosten" eenheid="€ per jaar" waarde={g.kostenJaar} naar={(n) => wijzig(wijzigGroep(b, g.id, { kostenJaar: n }))} bewerkbaar={bewerkbaar} />
            </div>
            {bewerkbaar && (
              <button type="button" className="mt-3 min-h-[44px] text-sm font-semibold text-crit hover:underline" onClick={() => wijzig({ ...b, groepen: b.groepen.filter((x) => x.id !== g.id) })}>
                Groep {g.naam} verwijderen
              </button>
            )}
          </li>
        ))}
      </ul>
      {b.groepen.length === 0 && <p className="text-sm text-neutralx-500">Nog geen groepen. Voeg er een toe, of laad bij Gegevens een voorbeeldset.</p>}
      {bewerkbaar && b.groepen.length < MAX_GROEPEN && (
        <button type="button" className="btn-ghost min-h-[44px]" onClick={() => wijzig({ ...b, groepen: [...b.groepen, nieuweGroep(b.groepen)] })}>
          + Groep toevoegen
        </button>
      )}
    </div>
  );
}

// ---- ruimtes ---------------------------------------------------------------

function RuimtesTab({ b, wijzig, bewerkbaar }: { b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutralx-600">
        Eén regel per soort ruimte. Heb je 12 gelijke spreekkamers? Dan één regel met aantal 12. De oppervlakte is die van één ruimte. Afdeling en verdieping helpen om te zien hoe alles is ingedeeld.
      </p>
      <ul className="space-y-3">
        {b.ruimtes.map((r) => (
          <li key={r.id} className="rounded-2xl border border-hair bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TekstVeld label="Naam" waarde={r.naam} naar={(t) => wijzig(wijzigRuimte(b, r.id, { naam: t }))} bewerkbaar={bewerkbaar} />
              <TekstVeld label="Soort" uitleg="Bijvoorbeeld spreekkamer of lokaal" waarde={r.soort} naar={(t) => wijzig(wijzigRuimte(b, r.id, { soort: t }))} bewerkbaar={bewerkbaar} max={60} />
              <GetalVeld label="Aantal" waarde={r.aantal} naar={(n) => wijzig(wijzigRuimte(b, r.id, { aantal: n !== null && n >= 1 ? Math.min(2000, Math.round(n)) : 1 }))} bewerkbaar={bewerkbaar} />
              <GetalVeld label="Oppervlakte per ruimte" eenheid="m²" waarde={r.m2} naar={(n) => wijzig(wijzigRuimte(b, r.id, { m2: n !== null && n >= 0 ? n : null }))} bewerkbaar={bewerkbaar} />
              <GetalVeld label="Plekken per ruimte" uitleg="Stoelen, bedden of werkplekken" waarde={r.plekken} naar={(n) => wijzig(wijzigRuimte(b, r.id, { plekken: n !== null && n >= 0 ? Math.round(n) : null }))} bewerkbaar={bewerkbaar} />
              <TekstVeld label="Afdeling" waarde={r.afdeling} naar={(t) => wijzig(wijzigRuimte(b, r.id, { afdeling: t }))} bewerkbaar={bewerkbaar} max={60} />
              <TekstVeld label="Verdieping" waarde={r.verdieping} naar={(t) => wijzig(wijzigRuimte(b, r.id, { verdieping: t }))} bewerkbaar={bewerkbaar} max={30} />
              <TekstVeld label="Notitie" uitleg="Bijvoorbeeld: grenst aan de wachtruimte" waarde={r.notitie} naar={(t) => wijzig(wijzigRuimte(b, r.id, { notitie: t }))} bewerkbaar={bewerkbaar} max={300} />
            </div>
            {bewerkbaar && (
              <button type="button" className="mt-3 min-h-[44px] text-sm font-semibold text-crit hover:underline" onClick={() => wijzig({ ...b, ruimtes: b.ruimtes.filter((x) => x.id !== r.id) })}>
                Ruimte {r.naam} verwijderen
              </button>
            )}
          </li>
        ))}
      </ul>
      {b.ruimtes.length === 0 && <p className="text-sm text-neutralx-500">Nog geen ruimtes. Voeg er een toe, of laad bij Gegevens een voorbeeldset voor jouw soort bedrijf.</p>}
      {bewerkbaar && b.ruimtes.length < MAX_RUIMTE_REGELS && (
        <button type="button" className="btn-ghost min-h-[44px]" onClick={() => wijzig({ ...b, ruimtes: [...b.ruimtes, nieuweRuimte(b.ruimtes)] })}>
          + Ruimte toevoegen
        </button>
      )}
    </div>
  );
}

// ---- bezetting -------------------------------------------------------------

function BezettingTab({ b, wijzig, bewerkbaar }: { b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean }) {
  const kiesId = useId();
  const vulId = useId();
  const [gekozen, setGekozen] = useState(b.ruimtes[0]?.id ?? "");
  const [vul, setVul] = useState("");
  const ruimte = b.ruimtes.find((r) => r.id === gekozen) ?? b.ruimtes[0];
  if (!ruimte) {
    return <p className="text-sm text-neutralx-500">Voeg eerst ruimtes toe bij Ruimtes.</p>;
  }
  const open = b.open.some(Boolean);
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutralx-600">
        Hoeveel procent van de ruimtes (van deze soort) is er gemiddeld bezet in elk dagdeel? Een schatting is genoeg. Dagdelen waarin je niet open bent, vul je niet in; zet ze bij Gegevens open als dat niet klopt.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Veld label="Ruimte" id={kiesId}>
          <select id={kiesId} value={ruimte.id} onChange={(e) => setGekozen(e.target.value)} className={invoerKlasse}>
            {b.ruimtes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.naam} ({r.aantal})
              </option>
            ))}
          </select>
        </Veld>
        {bewerkbaar && (
          <div>
            <label htmlFor={vulId} className="block text-sm font-medium text-ink">
              Alle open dagdelen vullen met (%)
            </label>
            <div className="mt-1 flex gap-2">
              <input id={vulId} type="text" inputMode="numeric" value={vul} onChange={(e) => setVul(e.target.value)} className="w-24 rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" />
              <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={procentOfNull(vul) === null} onClick={() => wijzig(vulOpenDagdelen(b, ruimte.id, procentOfNull(vul) ?? 0))}>
                Vullen
              </button>
              <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => wijzig(kopieerBezettingNaarAlle(b, ruimte.id))}>
                Kopieer naar alle ruimtes
              </button>
            </div>
          </div>
        )}
      </div>
      {!open && <p role="alert" className="text-sm font-medium text-crit">Er is geen dagdeel open gezet. Zet bij Gegevens aan wanneer je open bent.</p>}
      <div className="overflow-x-auto rounded-2xl border border-hair bg-white p-3">
        <table className="w-full min-w-[320px] text-sm">
          <caption className="sr-only">Bezetting van {ruimte.naam} per dag en dagdeel, in procenten</caption>
          <thead>
            <tr className="text-xs text-neutralx-500">
              <td />
              {DAGDELEN.map((d) => (
                <th key={d} scope="col" className="px-1 py-1.5 text-center font-medium">
                  {d}
                  <span className="block text-[10px] font-normal">{DAGDEEL_TIJD[d]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAGEN.map((dag, d) => (
              <tr key={dag}>
                <th scope="row" className="py-1 pr-2 text-left text-xs font-medium text-neutralx-600">{DAG_NAAM[dag]}</th>
                {DAGDELEN.map((deel, k) => {
                  const index = d * DAGDELEN.length + k;
                  const waarde = ruimte.bezetting[index];
                  const gesloten = b.open[index] !== true;
                  return (
                    <td key={deel} className="p-1 text-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${ruimte.naam}, ${DAG_NAAM[dag]} ${deel}, procent bezet${gesloten ? " (gesloten)" : ""}`}
                        defaultValue={typeof waarde === "number" ? String(waarde) : ""}
                        key={`${ruimte.id}-${index}-${typeof waarde === "number" ? waarde : "x"}`}
                        disabled={!bewerkbaar || gesloten}
                        placeholder={gesloten ? "–" : "%"}
                        onChange={(e) => wijzig(zetBezetting(b, ruimte.id, index, procentOfNull(e.target.value)))}
                        className="num h-11 w-16 rounded-lg border border-hairstrong bg-white px-2 text-center text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:bg-paper-soft"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
