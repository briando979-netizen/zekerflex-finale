"use client";

import { useEffect, useState } from "react";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, Melding, VELD, VELD_BASIS, dagNaam, useBeheerData, vraag } from "@/components/voorstel/beheer/api";

// Agenda-instellingen in drie tabbladen (Activiteiten, Openingstijden,
// Instellingen). Lege velden betekenen: de standaardwaarde houden.

type Regel = { duurMin: number; capaciteit: number; min: number; max: number; prijsPP?: number; prijsPPZondag?: number };
type ActInst = { online?: boolean; duurMin?: number; capaciteit?: number; min?: number; max?: number; prijsPP?: number; prijsPPZondag?: number };
type Tijden = { van: number; tot: number } | null;
type Blokkade = { datum: string; van: string; tot: string; activiteit: string; reden: string };
interface Inst {
  activiteiten: Record<string, ActInst>;
  open: Record<string, Tijden>;
  gesloten: string[];
  blokkades: Blokkade[];
  aankondiging: string;
}
interface Antwoord {
  instellingen: Inst;
  standaard: { activiteiten: Record<string, Regel>; open: Record<string, Tijden> };
}

const URL_INST = `${BEHEER_API}/instellingen`;
const DAGEN = [
  ["1", "Maandag"],
  ["2", "Dinsdag"],
  ["3", "Woensdag"],
  ["4", "Donderdag"],
  ["5", "Vrijdag"],
  ["6", "Zaterdag"],
  ["0", "Zondag"],
] as const;
const VELDEN = [
  ["duurMin", "Duur (min)"],
  ["capaciteit", "Plekken tegelijk"],
  ["min", "Min. groep"],
  ["max", "Max. groep"],
  ["prijsPP", "Prijs p.p. (€)"],
  ["prijsPPZondag", "Zondag p.p. (€)"],
] as const;
const klok = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minuten = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function useInstellingen() {
  const bron = useBeheerData<Antwoord>(URL_INST);
  const [inst, setInst] = useState<Inst | null>(null);
  const [ok, setOk] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  useEffect(() => {
    if (bron.data) setInst(bron.data.instellingen);
  }, [bron.data]);
  async function bewaar(nieuw: Inst) {
    setBezig(true);
    setOk("");
    setFout("");
    try {
      const d = await vraag<{ instellingen: Inst }>(URL_INST, { method: "PUT", body: nieuw });
      setInst(d.instellingen);
      setOk("Opgeslagen. De agenda gebruikt de nieuwe instellingen meteen.");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  }
  return { standaard: bron.data?.standaard ?? null, inst, setInst, bewaar, ok, fout: fout || bron.fout, bezig };
}

export function Activiteiten({ namen }: { namen: Record<string, string> }) {
  const { standaard, inst, setInst, bewaar, ok, fout, bezig } = useInstellingen();
  if (!standaard || !inst) return <Melding fout={fout} />;

  const zet = (slug: string, veld: keyof ActInst, waarde: number | boolean | undefined) =>
    setInst({ ...inst, activiteiten: { ...inst.activiteiten, [slug]: { ...(inst.activiteiten[slug] ?? {}), [veld]: waarde } } });

  return (
    <div className="space-y-4">
      <p className="text-sm text-schw-mute">Leeg veld = standaardwaarde (grijs). Zet een activiteit uit om hem tijdelijk niet online te laten boeken.</p>
      <div className="space-y-3">
        {Object.entries(standaard.activiteiten).map(([slug, std]) => {
          const a = inst.activiteiten[slug] ?? {};
          const online = a.online !== false;
          return (
            <div key={slug} className={`${KAART} ${online ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold">{namen[slug] ?? slug}</h3>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={online} onChange={(e) => zet(slug, "online", e.target.checked)} className="h-5 w-5 accent-[#FF5F1F]" />
                  Online te boeken
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {VELDEN.map(([veld, label]) => (
                  <label key={veld} className="text-xs font-semibold text-schw-mute">
                    {label}
                    <input
                      type="number"
                      min={0}
                      value={a[veld] ?? ""}
                      placeholder={std[veld] !== undefined ? String(std[veld]) : "–"}
                      onChange={(e) => zet(slug, veld, e.target.value === "" ? undefined : Number(e.target.value))}
                      className={`${VELD} mt-1 text-base`}
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-4 flex items-center gap-3">
        <button type="button" disabled={bezig} onClick={() => void bewaar(inst)} className={`${KNOP} shadow-lg`}>
          Opslaan
        </button>
        <div className="flex-1">
          <Melding fout={fout} ok={ok} />
        </div>
      </div>
    </div>
  );
}

export function Openingstijden({ namen }: { namen: Record<string, string> }) {
  const { standaard, inst, setInst, bewaar, ok, fout, bezig } = useInstellingen();
  const [nieuweDatum, setNieuweDatum] = useState("");
  const [blok, setBlok] = useState<Blokkade>({ datum: "", van: "14:00", tot: "17:00", activiteit: "", reden: "" });
  if (!standaard || !inst) return <Melding fout={fout} />;
  const blokGoed = !!blok.datum && blok.tot > blok.van;

  const tijdenVan = (dag: string): Tijden => (dag in inst.open ? (inst.open[dag] ?? null) : (standaard.open[dag] ?? null));
  const zet = (dag: string, t: Tijden) => setInst({ ...inst, open: { ...inst.open, [dag]: t } });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={KAART}>
        <h3 className="font-display text-lg font-bold">Openingstijden per dag</h3>
        <p className="mt-1 text-sm text-schw-mute">Op dichte dagen kunnen groepen vanaf 12 personen toch boeken (13:00 – 22:30).</p>
        <ul className="mt-4 space-y-2">
          {DAGEN.map(([dag, naam]) => {
            const t = tijdenVan(dag);
            return (
              <li key={dag} className="grid grid-cols-[7rem_auto_1fr] items-center gap-3">
                <span className="font-semibold">{naam}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!t} onChange={(e) => zet(dag, e.target.checked ? { van: 13 * 60, tot: 22 * 60 + 30 } : null)} className="h-4 w-4 accent-[#FF5F1F]" />
                  open
                </label>
                {t ? (
                  <span className="flex items-center gap-2">
                    <input type="time" aria-label={`${naam} open vanaf`} value={klok(t.van)} onChange={(e) => zet(dag, { ...t, van: minuten(e.target.value) })} className={`${VELD_BASIS} w-28`} />
                    –
                    <input type="time" aria-label={`${naam} open tot`} value={klok(t.tot)} onChange={(e) => zet(dag, { ...t, tot: minuten(e.target.value) })} className={`${VELD_BASIS} w-28`} />
                  </span>
                ) : (
                  <span className="text-sm text-schw-mute">dicht</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section className={KAART}>
        <h3 className="font-display text-lg font-bold">Gesloten dagen</h3>
        <p className="mt-1 text-sm text-schw-mute">Feestdagen, besloten feesten of onderhoud: op deze datums is online boeken dicht.</p>
        <div className="mt-4 flex gap-2">
          <input type="date" value={nieuweDatum} onChange={(e) => setNieuweDatum(e.target.value)} aria-label="Datum sluiten" className={`${VELD_BASIS} w-auto`} />
          <button
            type="button"
            disabled={!nieuweDatum}
            onClick={() => {
              setInst({ ...inst, gesloten: [...new Set([...inst.gesloten, nieuweDatum])].sort() });
              setNieuweDatum("");
            }}
            className={KNOP_LICHT}
          >
            Toevoegen
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {inst.gesloten.length === 0 && <li className="text-sm text-schw-mute">Geen extra gesloten dagen.</li>}
          {inst.gesloten.map((d) => (
            <li key={d} className="flex items-center justify-between rounded-xl bg-schw-cream px-3 py-2">
              <span className="first-letter:uppercase">{dagNaam(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
              <button type="button" onClick={() => setInst({ ...inst, gesloten: inst.gesloten.filter((x) => x !== d) })} className="text-sm font-semibold text-[#B91C1C]">
                Weer open
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className={`${KAART} lg:col-span-2`}>
        <h3 className="font-display text-lg font-bold">Blokkades (deel van een dag)</h3>
        <p className="mt-1 text-sm text-schw-mute">
          Een besloten feest of onderhoud: in dit blok is de activiteit (of alles) online niet te boeken. Reserveringen die er al staan blijven staan; kijk die na in de Planning.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[auto_auto_auto_1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-semibold">
            Datum
            <input type="date" value={blok.datum} onChange={(e) => setBlok({ ...blok, datum: e.target.value })} className={`${VELD_BASIS} mt-1 block w-auto`} />
          </label>
          <label className="text-sm font-semibold">
            Van
            <input type="time" step={900} value={blok.van} onChange={(e) => setBlok({ ...blok, van: e.target.value })} className={`${VELD_BASIS} mt-1 block w-28`} />
          </label>
          <label className="text-sm font-semibold">
            Tot
            <input type="time" step={900} value={blok.tot} onChange={(e) => setBlok({ ...blok, tot: e.target.value })} className={`${VELD_BASIS} mt-1 block w-28`} />
          </label>
          <label className="text-sm font-semibold">
            Activiteit
            <select value={blok.activiteit} onChange={(e) => setBlok({ ...blok, activiteit: e.target.value })} className={`${VELD} mt-1`}>
              <option value="">Alle activiteiten</option>
              {Object.keys(standaard.activiteiten).map((slug) => (
                <option key={slug} value={slug}>
                  {namen[slug] ?? slug}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Reden (intern)
            <input value={blok.reden} maxLength={120} onChange={(e) => setBlok({ ...blok, reden: e.target.value })} placeholder="Bijv. besloten feest Bakker BV" className={`${VELD} mt-1`} />
          </label>
          <button
            type="button"
            disabled={!blokGoed}
            onClick={() => {
              setInst({ ...inst, blokkades: [...inst.blokkades, blok].sort((a, b) => `${a.datum}${a.van}`.localeCompare(`${b.datum}${b.van}`)) });
              setBlok({ ...blok, reden: "" });
            }}
            className={KNOP_LICHT}
          >
            Toevoegen
          </button>
        </div>
        {blok.datum && !blokGoed && <p className="mt-2 text-sm font-semibold text-[#B91C1C]">De eindtijd moet na de begintijd liggen.</p>}
        <ul className="mt-4 space-y-2">
          {inst.blokkades.length === 0 && <li className="text-sm text-schw-mute">Geen blokkades.</li>}
          {inst.blokkades.map((k, i) => (
            <li key={`${k.datum}-${k.van}-${k.activiteit}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-schw-cream px-3 py-2">
              <span>
                <span className="font-semibold first-letter:uppercase">{dagNaam(k.datum, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span> · {k.van}–{k.tot} ·{" "}
                {k.activiteit ? (namen[k.activiteit] ?? k.activiteit) : "alle activiteiten"}
                {k.reden && <span className="text-schw-mute"> · {k.reden}</span>}
              </span>
              <button type="button" onClick={() => setInst({ ...inst, blokkades: inst.blokkades.filter((_, j) => j !== i) })} className="text-sm font-semibold text-[#B91C1C]">
                Weghalen
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex items-center gap-3 lg:col-span-2">
        <button type="button" disabled={bezig} onClick={() => void bewaar(inst)} className={KNOP}>
          Opslaan
        </button>
        <div className="flex-1">
          <Melding fout={fout} ok={ok} />
        </div>
      </div>
    </div>
  );
}

export function Aankondiging() {
  const { inst, setInst, bewaar, ok, fout, bezig } = useInstellingen();
  if (!inst) return <Melding fout={fout} />;
  return (
    <section className={`${KAART} max-w-2xl`}>
      <h3 className="font-display text-lg font-bold">Aankondiging bovenaan de site</h3>
      <p className="mt-1 text-sm text-schw-mute">Bijvoorbeeld een actie of een kerstevent. Leeg laten = geen balk.</p>
      <textarea
        rows={3}
        maxLength={300}
        value={inst.aankondiging}
        onChange={(e) => setInst({ ...inst, aankondiging: e.target.value })}
        placeholder="Beleef het leukste kerstevent 2026: wees er snel bij want vol=vol!"
        className={`${VELD} mt-4`}
      />
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={bezig} onClick={() => void bewaar(inst)} className={KNOP}>
          Opslaan
        </button>
        <div className="flex-1">
          <Melding fout={fout} ok={ok} />
        </div>
      </div>
    </section>
  );
}
