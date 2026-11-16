"use client";

import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { analyseer, roosterRijen, type Analyse } from "@/lib/inkaart/analyse";
import {
  getalOfNull,
  kopieerBezettingNaarAlle,
  nieuweGroep,
  nieuweRuimte,
  procentOfNull,
  vulOpenDagdelen,
  wijzigGroep,
  wijzigRuimte,
  zetBezetting,
  zetOpen,
} from "@/lib/inkaart/bewerk";
import { DAGDELEN, DAGEN, MAX_GROEPEN, MAX_RUIMTE_REGELS, SOORTEN, type BedrijfInKaart, type Soort } from "@/lib/inkaart/model";
import { euroTekst, getalTekst, plekNaam, signaalTekst } from "@/lib/inkaart/render";
import { soortNaam, voorbeeldRegels, type Taal } from "@/lib/inkaart/sjablonen";
import type { InKaartTeksten } from "@/lib/inkaart/teksten";
import { vulIn } from "@/lib/i18n/vul-in";

// ---------------------------------------------------------------------------
// Bedrijf in kaart (lib/inkaart): vijf tabbladen. Resultaat laat zien wat uit de ingevulde gegevens volgt (live berekend in de browser met
// lib/inkaart/analyse.ts), de andere vier zijn om in te vullen: Gegevens (kosten, doelen, openingstijden), Personeel, Ruimtes en Bezetting.
// Bewaren gaat naar /api/werkgever/in-kaart; het scherm neemt de bewaarde versie van de server over. Alle tekst komt van de server in de taal van
// de werkgeversapp (lib/inkaart/teksten.ts, Nederlands en Engels) en wordt via `t` getoond.
// ---------------------------------------------------------------------------

type Tab = "resultaat" | "gegevens" | "personeel" | "ruimtes" | "bezetting";
const TAB_VOLGORDE: Tab[] = ["resultaat", "gegevens", "personeel", "ruimtes", "bezetting"];

const taalVan = (t: InKaartTeksten): Taal => (t.taal.startsWith("en") ? "en" : "nl");

export function InKaart({ start, magWijzigen, t }: { start: BedrijfInKaart; magWijzigen: boolean; t: InKaartTeksten }) {
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
      if (!res.ok || !data.bedrijf) throw new Error(data.error?.message ?? t.balk.fout);
      // de bewaarde versie van de server overnemen (met het tijdstip), niet onze eigen kopie
      setB(data.bedrijf);
      setVers((v) => v + 1);
      setGewijzigd(false);
      setMelding({ soort: "ok", tekst: t.balk.bewaard });
    } catch (err) {
      setMelding({ soort: "fout", tekst: err instanceof Error ? err.message : t.balk.fout });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-6">
      <Voortgang t={t} volledigheid={analyse.volledigheid} />

      <div role="tablist" aria-label={t.tabs.label} className="flex flex-wrap gap-1 border-b border-hair">
        {TAB_VOLGORDE.map((sleutel) => (
          <button
            key={sleutel}
            type="button"
            role="tab"
            id={`inkaart-tab-${sleutel}`}
            aria-selected={tab === sleutel}
            aria-controls={`inkaart-paneel-${sleutel}`}
            onClick={() => setTab(sleutel)}
            className={`min-h-[44px] rounded-t-lg px-4 text-sm font-semibold transition ${tab === sleutel ? "border-b-2 border-brand-500 text-ink" : "text-neutralx-500 hover:text-ink"}`}
          >
            {t.tabs[sleutel]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`inkaart-paneel-${tab}`} aria-labelledby={`inkaart-tab-${tab}`} key={`${tab}-${vers}`}>
        {tab === "resultaat" && <ResultaatTab t={t} b={b} a={analyse} naarTab={setTab} />}
        {tab === "gegevens" && <GegevensTab t={t} b={b} wijzig={wijzig} bewerkbaar={magWijzigen} naarTab={setTab} />}
        {tab === "personeel" && <PersoneelTab t={t} b={b} wijzig={wijzig} bewerkbaar={magWijzigen} />}
        {tab === "ruimtes" && <RuimtesTab t={t} b={b} wijzig={wijzig} bewerkbaar={magWijzigen} />}
        {tab === "bezetting" && <BezettingTab t={t} b={b} wijzig={wijzig} bewerkbaar={magWijzigen} />}
      </div>

      {magWijzigen ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-hair bg-white/95 px-4 py-3 backdrop-blur lg:mx-0 lg:rounded-xl lg:border">
          <button type="button" onClick={() => void bewaar()} disabled={bezig || !gewijzigd} className="btn-primary min-h-[44px]">
            {bezig ? t.balk.bezig : t.balk.bewaar}
          </button>
          <span className="text-sm text-neutralx-500">{gewijzigd ? t.balk.gewijzigd : t.balk.klaar}</span>
          {melding && (
            <span role={melding.soort === "fout" ? "alert" : "status"} className={`text-sm font-medium ${melding.soort === "fout" ? "text-crit" : "text-brand-600"}`}>
              {melding.tekst}
            </span>
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-600">{t.balk.alleenLezen}</p>
      )}
    </div>
  );
}

function Voortgang({ t, volledigheid }: { t: InKaartTeksten; volledigheid: number }) {
  return (
    <div className="rounded-2xl border border-hair bg-white p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{t.voortgang.titel}</span>
        <span className="num text-neutralx-600">{volledigheid}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-soft" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={volledigheid} aria-label={t.voortgang.aria}>
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${volledigheid}%` }} />
      </div>
      <p className="mt-2 text-xs text-neutralx-500">{t.voortgang.hint}</p>
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

function ResultaatTab({ t, b, a, naarTab }: { t: InKaartTeksten; b: BedrijfInKaart; a: Analyse; naarTab: (tab: Tab) => void }) {
  const euro = (n: number | null) => (n === null ? "–" : euroTekst(t, n));
  const pct = (n: number | null) => (n === null ? "–" : `${getalTekst(t, n)}%`);
  const leeg = b.ruimtes.length === 0 && b.groepen.length === 0 && b.omzetJaar === null;
  if (leeg) {
    return (
      <div className="rounded-2xl border border-hair bg-white p-6 text-center">
        <p className="font-display text-lg font-bold text-ink">{t.start.titel}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-neutralx-600">{t.start.tekst}</p>
        <button type="button" onClick={() => naarTab("gegevens")} className="btn-primary mt-4 min-h-[44px]">
          {t.start.knop}
        </button>
      </div>
    );
  }
  const f = a.financieel;
  const k = t.kpi;
  return (
    <div className="space-y-8">
      <section aria-label={k.kerncijfers} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kaart
          titel={k.personeelPct}
          waarde={pct(f.personeelPct)}
          uitleg={
            f.personeelskosten !== null
              ? `${vulIn(k.perJaar, { bedrag: euroTekst(t, f.personeelskosten) })}${b.doelPersoneelPct !== null ? `, ${vulIn(k.doel, { pct: b.doelPersoneelPct })}` : ""}`
              : k.vulPersoneelOmzet
          }
        />
        <Kaart titel={k.kostenPerFte} waarde={euro(f.kostenPerFte)} uitleg={f.fte > 0 ? vulIn(k.fte, { n: getalTekst(t, f.fte) }) : k.vulFte} />
        <Kaart titel={k.ruimtes} waarde={getalTekst(t, a.ruimtes.aantal)} uitleg={a.ruimtes.m2Totaal !== null ? vulIn(k.m2Samen, { n: getalTekst(t, a.ruimtes.m2Totaal) }) : k.vulOppervlakte} />
        <Kaart titel={k.gemBezetting} waarde={pct(a.bezetting.gemiddeld)} uitleg={a.bezetting.gemiddeld !== null ? vulIn(k.overOpen, { n: a.bezetting.ruimtesMetGegevens }) : k.vulDrukte} />
      </section>

      {(f.huurPct !== null || a.ruimtes.m2PerFte !== null || f.omzetPerFte !== null) && (
        <section aria-label={k.meer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kaart titel={k.omzetPerFte} waarde={euro(f.omzetPerFte)} />
          <Kaart titel={k.huurPct} waarde={pct(f.huurPct)} />
          <Kaart titel={k.omzetPerM2} waarde={euro(f.omzetPerM2)} />
          <Kaart titel={k.m2PerFte} waarde={a.ruimtes.m2PerFte === null ? "–" : getalTekst(t, a.ruimtes.m2PerFte)} />
        </section>
      )}

      <section aria-labelledby="inkaart-signalen">
        <h2 id="inkaart-signalen" className="font-display text-xl font-bold text-ink">
          {t.signalen.kop}
        </h2>
        {a.signalen.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">{t.signalen.leeg}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {a.signalen.map((s) => {
              const tekst = signaalTekst(t, s);
              return (
                <li key={s.id} className={`rounded-2xl border p-4 ${s.niveau === "aandacht" ? "border-warn/40 bg-warn/5" : "border-hair bg-white"}`}>
                  <p className="text-sm font-semibold text-ink">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${s.niveau === "aandacht" ? "bg-warn/20 text-ink" : "bg-paper-soft text-neutralx-600"}`}>
                      {s.niveau === "aandacht" ? t.signalen.aandacht : t.signalen.info}
                    </span>
                    {tekst.titel}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutralx-600">{tekst.waarom}</p>
                  {s.actie && tekst.actie && (
                    <Link href={s.actie.href} className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
                      {tekst.actie} →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="inkaart-rooster">
        <h2 id="inkaart-rooster" className="font-display text-xl font-bold text-ink">
          {t.rooster.kop}
        </h2>
        <p className="mt-1 text-sm text-neutralx-600">{t.rooster.uitleg}</p>
        <RoosterTabel t={t} raster={a.bezetting.raster} />
        {a.bezetting.piek && a.bezetting.dal && (
          <p className="mt-2 text-sm text-neutralx-600">
            {vulIn(t.rooster.piekDal, {
              piek: plekNaam(t, a.bezetting.piek.index),
              piekPct: a.bezetting.piek.pct,
              dal: plekNaam(t, a.bezetting.dal.index),
              dalPct: a.bezetting.dal.pct,
            })}
          </p>
        )}
      </section>

      {a.perRuimte.length > 0 && (
        <section aria-labelledby="inkaart-ruimtes">
          <h2 id="inkaart-ruimtes" className="font-display text-xl font-bold text-ink">
            {t.perRuimte.kop}
          </h2>
          <div className="relative mt-3 overflow-x-auto rounded-2xl border border-hair bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">{t.perRuimte.caption}</caption>
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">{t.perRuimte.ruimte}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t.perRuimte.aantal}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t.perRuimte.gemBezet}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t.perRuimte.nodig}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t.perRuimte.leeg}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t.perRuimte.uren}</th>
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
          <p className="mt-2 text-xs text-neutralx-500">{t.perRuimte.noot}</p>
        </section>
      )}
    </div>
  );
}

function KopDagdelen({ t }: { t: InKaartTeksten }) {
  return (
    <thead>
      <tr className="text-xs text-neutralx-500">
        <td />
        {t.dagdelen.map((d) => (
          <th key={d.naam} scope="col" className="px-1 py-1.5 text-center font-medium">
            {d.naam}
            <span className="block text-[10px] font-normal">{d.tijd}</span>
          </th>
        ))}
      </tr>
    </thead>
  );
}

function RoosterTabel({ t, raster }: { t: InKaartTeksten; raster: (number | null)[] }) {
  const rijen = roosterRijen(raster);
  return (
    <div className="relative mt-3 overflow-x-auto rounded-2xl border border-hair bg-white p-3">
      <table className="w-full min-w-[320px] text-sm">
        <caption className="sr-only">{t.rooster.caption}</caption>
        <KopDagdelen t={t} />
        <tbody>
          {rijen.map((r, d) => (
            <tr key={r.dag}>
              <th scope="row" className="py-1 pr-2 text-left text-xs font-medium text-neutralx-600">{t.dagen[d]}</th>
              {r.waarden.map((w, k) => (
                <td key={k} className="p-1">
                  <div
                    className="num grid h-10 place-items-center rounded-lg text-xs font-semibold text-ink"
                    style={{ background: w === null ? "transparent" : `rgba(var(--brand-500-rgb), ${0.08 + (w / 100) * 0.55})`, border: w === null ? "1px dashed var(--hair, #d9ddd9)" : "none" }}
                    title={w === null ? t.rooster.gesloten : vulIn(t.rooster.bezet, { pct: w })}
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

function GegevensTab({ t, b, wijzig, bewerkbaar, naarTab }: { t: InKaartTeksten; b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean; naarTab: (tab: Tab) => void }) {
  const soortId = useId();
  const [bevestig, setBevestig] = useState(false);
  const g = t.gegevens;
  const taal = taalVan(t);
  const heeftRegels = b.ruimtes.length > 0 || b.groepen.length > 0;

  function laadVoorbeeld() {
    const r = voorbeeldRegels(b.soort, taal);
    wijzig({ ...b, groepen: r.groepen, ruimtes: r.ruimtes, open: r.open });
    setBevestig(false);
    naarTab("ruimtes");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-bold text-ink">{g.bedrijfKop}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Veld label={g.soort} id={soortId} uitleg={g.soortUitleg}>
            <select id={soortId} value={b.soort} disabled={!bewerkbaar} onChange={(e) => wijzig({ ...b, soort: e.target.value as Soort })} className={invoerKlasse}>
              {SOORTEN.map((s) => (
                <option key={s} value={s}>
                  {soortNaam(s, taal)}
                </option>
              ))}
            </select>
          </Veld>
          <GetalVeld label={g.jaar} waarde={b.jaar} naar={(n) => wijzig({ ...b, jaar: n !== null && n >= 2000 && n <= 2100 ? Math.round(n) : b.jaar })} bewerkbaar={bewerkbaar} />
        </div>
        {bewerkbaar && b.soort !== "overig" && (
          <div className="mt-4">
            {!bevestig ? (
              <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => (heeftRegels ? setBevestig(true) : laadVoorbeeld())}>
                {vulIn(g.voorbeeld, { soort: soortNaam(b.soort, taal).toLowerCase() })}
              </button>
            ) : (
              <div role="alert" className="rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm">
                <p className="text-ink">{g.vervangVraag}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary min-h-[44px] text-sm" onClick={laadVoorbeeld}>
                    {g.ja}
                  </button>
                  <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => setBevestig(false)}>
                    {g.nee}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-bold text-ink">{g.geldKop}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{g.geldUitleg}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <GetalVeld label={g.omzet} eenheid={g.perJaarEenheid} waarde={b.omzetJaar} naar={(n) => wijzig({ ...b, omzetJaar: n })} bewerkbaar={bewerkbaar} />
          <GetalVeld label={g.personeelskosten} eenheid={g.perJaarEenheid} uitleg={g.personeelskostenUitleg} waarde={b.personeelskostenJaar} naar={(n) => wijzig({ ...b, personeelskostenJaar: n })} bewerkbaar={bewerkbaar} />
          <GetalVeld label={g.huur} eenheid={g.perJaarEenheid} waarde={b.huurJaar} naar={(n) => wijzig({ ...b, huurJaar: n })} bewerkbaar={bewerkbaar} />
        </div>
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-bold text-ink">{g.doelenKop}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{g.doelenUitleg}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <GetalVeld label={g.doelPersoneel} eenheid={g.doelPersoneelEenheid} procent waarde={b.doelPersoneelPct} naar={(n) => wijzig({ ...b, doelPersoneelPct: n })} bewerkbaar={bewerkbaar} />
          <GetalVeld label={g.doelBezetting} eenheid={g.doelBezettingEenheid} procent uitleg={g.doelBezettingUitleg} waarde={b.doelBezettingPct} naar={(n) => wijzig({ ...b, doelBezettingPct: n })} bewerkbaar={bewerkbaar} />
        </div>
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-bold text-ink">{g.openKop}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{g.openUitleg}</p>
        <OpenTijden t={t} b={b} wijzig={wijzig} bewerkbaar={bewerkbaar} />
      </section>
    </div>
  );
}

function OpenTijden({ t, b, wijzig, bewerkbaar }: { t: InKaartTeksten; b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean }) {
  return (
    <div className="relative mt-3 overflow-x-auto">
      <table className="w-full min-w-[320px] text-sm">
        <caption className="sr-only">{t.gegevens.openCaption}</caption>
        <KopDagdelen t={t} />
        <tbody>
          {DAGEN.map((dag, d) => (
            <tr key={dag}>
              <th scope="row" className="py-1 pr-2 text-left text-xs font-medium text-neutralx-600">{t.dagen[d]}</th>
              {DAGDELEN.map((deel, k) => {
                const index = d * DAGDELEN.length + k;
                return (
                  <td key={deel} className="p-1 text-center">
                    <label className="inline-grid h-11 w-11 cursor-pointer place-items-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={b.open[index] === true}
                        disabled={!bewerkbaar}
                        onChange={(e) => wijzig(zetOpen(b, index, e.target.checked))}
                        aria-label={vulIn(t.gegevens.openLabel, { dag: t.dagen[d] ?? "", deel: t.dagdelen[k]?.naam ?? "" })}
                      />
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

function PersoneelTab({ t, b, wijzig, bewerkbaar }: { t: InKaartTeksten; b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean }) {
  const p = t.personeel;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutralx-600">{p.uitleg}</p>
      <ul className="space-y-3">
        {b.groepen.map((g) => (
          <li key={g.id} className="rounded-2xl border border-hair bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <TekstVeld label={p.groep} waarde={g.naam} naar={(x) => wijzig(wijzigGroep(b, g.id, { naam: x }))} bewerkbaar={bewerkbaar} />
              <GetalVeld label={p.fte} waarde={g.fte} naar={(n) => wijzig(wijzigGroep(b, g.id, { fte: n !== null && n >= 0 ? n : 0 }))} bewerkbaar={bewerkbaar} />
              <GetalVeld label={p.kosten} eenheid={t.gegevens.perJaarEenheid} waarde={g.kostenJaar} naar={(n) => wijzig(wijzigGroep(b, g.id, { kostenJaar: n }))} bewerkbaar={bewerkbaar} />
            </div>
            {bewerkbaar && (
              <button type="button" className="mt-3 min-h-[44px] text-sm font-semibold text-crit hover:underline" onClick={() => wijzig({ ...b, groepen: b.groepen.filter((x) => x.id !== g.id) })}>
                {vulIn(p.verwijder, { naam: g.naam })}
              </button>
            )}
          </li>
        ))}
      </ul>
      {b.groepen.length === 0 && <p className="text-sm text-neutralx-500">{p.leeg}</p>}
      {bewerkbaar && b.groepen.length < MAX_GROEPEN && (
        <button type="button" className="btn-ghost min-h-[44px]" onClick={() => wijzig({ ...b, groepen: [...b.groepen, nieuweGroep(b.groepen, t.ruimtes.nieuweGroep)] })}>
          {p.voeg}
        </button>
      )}
    </div>
  );
}

// ---- ruimtes ---------------------------------------------------------------

function RuimtesTab({ t, b, wijzig, bewerkbaar }: { t: InKaartTeksten; b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean }) {
  const r = t.ruimtes;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutralx-600">{r.uitleg}</p>
      <ul className="space-y-3">
        {b.ruimtes.map((x) => (
          <li key={x.id} className="rounded-2xl border border-hair bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TekstVeld label={r.naam} waarde={x.naam} naar={(v) => wijzig(wijzigRuimte(b, x.id, { naam: v }))} bewerkbaar={bewerkbaar} />
              <TekstVeld label={r.soort} uitleg={r.soortUitleg} waarde={x.soort} naar={(v) => wijzig(wijzigRuimte(b, x.id, { soort: v }))} bewerkbaar={bewerkbaar} max={60} />
              <GetalVeld label={r.aantal} waarde={x.aantal} naar={(n) => wijzig(wijzigRuimte(b, x.id, { aantal: n !== null && n >= 1 ? Math.min(2000, Math.round(n)) : 1 }))} bewerkbaar={bewerkbaar} />
              <GetalVeld label={r.m2} eenheid="m²" waarde={x.m2} naar={(n) => wijzig(wijzigRuimte(b, x.id, { m2: n !== null && n >= 0 ? n : null }))} bewerkbaar={bewerkbaar} />
              <GetalVeld label={r.plekken} uitleg={r.plekkenUitleg} waarde={x.plekken} naar={(n) => wijzig(wijzigRuimte(b, x.id, { plekken: n !== null && n >= 0 ? Math.round(n) : null }))} bewerkbaar={bewerkbaar} />
              <TekstVeld label={r.afdeling} waarde={x.afdeling} naar={(v) => wijzig(wijzigRuimte(b, x.id, { afdeling: v }))} bewerkbaar={bewerkbaar} max={60} />
              <TekstVeld label={r.verdieping} waarde={x.verdieping} naar={(v) => wijzig(wijzigRuimte(b, x.id, { verdieping: v }))} bewerkbaar={bewerkbaar} max={30} />
              <TekstVeld label={r.notitie} uitleg={r.notitieUitleg} waarde={x.notitie} naar={(v) => wijzig(wijzigRuimte(b, x.id, { notitie: v }))} bewerkbaar={bewerkbaar} max={300} />
            </div>
            {bewerkbaar && (
              <button type="button" className="mt-3 min-h-[44px] text-sm font-semibold text-crit hover:underline" onClick={() => wijzig({ ...b, ruimtes: b.ruimtes.filter((y) => y.id !== x.id) })}>
                {vulIn(r.verwijder, { naam: x.naam })}
              </button>
            )}
          </li>
        ))}
      </ul>
      {b.ruimtes.length === 0 && <p className="text-sm text-neutralx-500">{r.leeg}</p>}
      {bewerkbaar && b.ruimtes.length < MAX_RUIMTE_REGELS && (
        <button type="button" className="btn-ghost min-h-[44px]" onClick={() => wijzig({ ...b, ruimtes: [...b.ruimtes, nieuweRuimte(b.ruimtes, r.nieuwNaam)] })}>
          {r.voeg}
        </button>
      )}
    </div>
  );
}

// ---- bezetting -------------------------------------------------------------

function BezettingTab({ t, b, wijzig, bewerkbaar }: { t: InKaartTeksten; b: BedrijfInKaart; wijzig: (b: BedrijfInKaart) => void; bewerkbaar: boolean }) {
  const kiesId = useId();
  const vulId = useId();
  const z = t.bezetting;
  const [gekozen, setGekozen] = useState(b.ruimtes[0]?.id ?? "");
  const [vul, setVul] = useState("");
  const ruimte = b.ruimtes.find((r) => r.id === gekozen) ?? b.ruimtes[0];
  if (!ruimte) {
    return <p className="text-sm text-neutralx-500">{z.eerst}</p>;
  }
  const open = b.open.some(Boolean);
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutralx-600">{z.uitleg}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Veld label={z.ruimte} id={kiesId}>
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
              {z.vul}
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input id={vulId} type="text" inputMode="numeric" value={vul} onChange={(e) => setVul(e.target.value)} className="w-24 rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" />
              <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={procentOfNull(vul) === null} onClick={() => wijzig(vulOpenDagdelen(b, ruimte.id, procentOfNull(vul) ?? 0))}>
                {z.vulKnop}
              </button>
              <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={() => wijzig(kopieerBezettingNaarAlle(b, ruimte.id))}>
                {z.kopieer}
              </button>
            </div>
          </div>
        )}
      </div>
      {!open && (
        <p role="alert" className="text-sm font-medium text-crit">
          {z.geenOpen}
        </p>
      )}
      <div className="relative overflow-x-auto rounded-2xl border border-hair bg-white p-3">
        <table className="w-full min-w-[320px] text-sm">
          <caption className="sr-only">{vulIn(z.caption, { naam: ruimte.naam })}</caption>
          <KopDagdelen t={t} />
          <tbody>
            {DAGEN.map((dag, d) => (
              <tr key={dag}>
                <th scope="row" className="py-1 pr-2 text-left text-xs font-medium text-neutralx-600">{t.dagen[d]}</th>
                {DAGDELEN.map((deel, k) => {
                  const index = d * DAGDELEN.length + k;
                  const waarde = ruimte.bezetting[index];
                  const gesloten = b.open[index] !== true;
                  return (
                    <td key={deel} className="p-1 text-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={vulIn(z.cel, { naam: ruimte.naam, dag: t.dagen[d] ?? "", deel: t.dagdelen[k]?.naam ?? "", gesloten: gesloten ? z.gesloten : "" })}
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
