"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar/links";
import Link from "next/link";
import { BASE, CONTACT } from "@/lib/voorstel/schwarzwald";
import { deelTekst } from "@/lib/voorstel/uitje-tekst";
import { DeelUitje } from "@/components/voorstel/DeelUitje";
import { WachtlijstAanmelding } from "@/components/voorstel/WachtlijstAanmelding";
import { BlijfEten } from "@/components/voorstel/BlijfEten";

// Eigen reserveringsagenda: activiteit + groep kiezen, dag in de maandkalender,
// tijdslot, gegevens, bevestigen. Beschikbaarheid en boeken via
// /api/voorstel/schwarzwald/agenda; vol of dicht staat meteen in de kalender.

export interface AgendaActiviteit {
  slug: string;
  naam: string;
  min: number;
  max: number;
  duurMin: number;
}

type DagStatus = "verleden" | "gesloten" | "vrij" | "vol";
type SlotStatus = "vrij" | "bijna-vol" | "vol";
interface Bevestiging { id: string; activiteit: string; datum: string; tijd: string; personen: number; prijs: number | null; ics: string; deel: string }

const API = "/api/voorstel/schwarzwald/agenda";
const WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const VELD = "mt-1.5 w-full rounded-2xl border-0 bg-white px-4 py-3 text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";
const STAP = "font-display text-xl font-bold";

const euro = (n: number) => `€ ${n.toLocaleString("nl-NL")}`;
// vaste tijdzone: de datum is een kalenderdag, geen moment
const dagNaam = (datum: string, opties: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("nl-NL", { ...opties, timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));
const volgendeMaand = (maand: string, n: number) => {
  const [j, m] = maand.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(j, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const eindTijd = (tijd: string, duur: number) => {
  const m = Number(tijd.slice(0, 2)) * 60 + Number(tijd.slice(3)) + duur;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function SchwarzwaldAgenda({
  activiteiten,
  start = "",
  startDatum = "",
  gegevens: bekend = null,
}: {
  activiteiten: AgendaActiviteit[];
  start?: string;
  /** JJJJ-MM-DD: deze dag alvast kiezen (link "eerstvolgende vrije dagen") */
  startDatum?: string;
  /** ingelogd account: velden alvast ingevuld */
  gegevens?: { naam: string; email: string; telefoon: string } | null;
}) {
  const eerste = activiteiten.find((a) => a.slug === start) ?? activiteiten[0];
  const [slug, setSlug] = useState(eerste?.slug ?? "");
  const act = activiteiten.find((a) => a.slug === slug);
  const [personen, setPersonen] = useState(Math.max(eerste?.min ?? 8, 8));
  const [maand, setMaand] = useState(startDatum.slice(0, 7));
  const [vandaag, setVandaag] = useState("");
  const [dagen, setDagen] = useState<{ datum: string; status: DagStatus }[]>([]);
  const [datum, setDatum] = useState(startDatum);
  const [sloten, setSloten] = useState<{ tijd: string; status: SlotStatus }[] | null>(null);
  const [prijs, setPrijs] = useState<number | null>(null);
  const [tijd, setTijd] = useState("");
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState<Bevestiging | null>(null);
  // verhogen = beschikbaarheid opnieuw ophalen (na een mislukte of gelukte boeking)
  const [ververs, setVervers] = useState(0);
  const [gegevens, setGegevens] = useState({ naam: bekend?.naam ?? "", email: bekend?.email ?? "", telefoon: bekend?.telefoon ?? "", opmerking: "", akkoord: false });

  const groepOk = !!act && personen >= act.min && personen <= act.max;

  // maandoverzicht ophalen (bij start, andere activiteit/groep of maand)
  useEffect(() => {
    if (!act || !groepOk) return;
    const ctrl = new AbortController();
    setLaden(true);
    const q = new URLSearchParams({ activiteit: act.slug, personen: String(personen), maand: maand || new Date().toISOString().slice(0, 7) });
    fetch(`${API}?${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { maand?: string; vandaag?: string; dagen?: { datum: string; status: DagStatus }[]; error?: { message?: string } }) => {
        if (!d.dagen) throw new Error(d.error?.message ?? "Kon de agenda niet laden.");
        setDagen(d.dagen);
        if (d.vandaag) {
          setVandaag(d.vandaag);
          if (!maand) setMaand(d.vandaag.slice(0, 7));
        }
        setFout("");
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setFout(e instanceof Error ? e.message : "Kon de agenda niet laden.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLaden(false);
      });
    return () => ctrl.abort();
  }, [act, personen, maand, groepOk, ververs]);

  // tijdsloten van de gekozen dag
  useEffect(() => {
    setTijd("");
    setSloten(null);
    if (!act || !datum || !groepOk) return;
    const ctrl = new AbortController();
    const q = new URLSearchParams({ activiteit: act.slug, personen: String(personen), datum });
    fetch(`${API}?${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { sloten?: { tijd: string; status: SlotStatus }[]; prijs?: number | null }) => {
        setSloten(d.sloten ?? []);
        setPrijs(d.prijs ?? null);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSloten([]);
      });
    return () => ctrl.abort();
  }, [act, personen, datum, groepOk, ververs]);

  // gekozen dag vervalt als hij voorbij of dicht is; een volle dag blijft
  // gekozen, want daar kan de gast op de wachtlijst
  useEffect(() => {
    if (datum && dagen.some((d) => d.datum === datum && d.status !== "vrij" && d.status !== "vol")) setDatum("");
  }, [dagen, datum]);

  const rooster = useMemo(() => {
    if (!dagen.length) return [];
    const eersteDag = new Date(`${dagen[0]?.datum}T00:00:00Z`).getUTCDay();
    const leeg = (eersteDag + 6) % 7; // maandag eerst
    return [...Array.from({ length: leeg }, () => null), ...dagen];
  }, [dagen]);

  const magTerug = !!maand && !!vandaag && maand > vandaag.slice(0, 7);
  const magVooruit = !!maand && !!vandaag && maand < volgendeMaand(vandaag.slice(0, 7), 6);

  async function bevestig(e: FormEvent) {
    e.preventDefault();
    if (!act || !datum || !tijd) return;
    setBezig(true);
    setFout("");
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activiteit: act.slug, datum, tijd, personen, ...gegevens }),
      });
      const d = (await r.json()) as Bevestiging & { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Boeken is niet gelukt.");
      setKlaar(d);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Boeken is niet gelukt.");
      // slot kan net vol zijn: ververs de tijden
      setVervers((v) => v + 1);
    } finally {
      setBezig(false);
    }
  }

  if (klaar && act) {
    const ev = {
      title: `${act.naam} bij Het Schwarzwald`,
      startLocal: `${klaar.datum}T${klaar.tijd}:00`,
      endLocal: `${klaar.datum}T${eindTijd(klaar.tijd, act.duurMin)}:00`,
      location: `${CONTACT.naam}, ${CONTACT.adres}, ${CONTACT.postcode}`,
      description: `Reservering ${klaar.id} voor ${klaar.personen} personen.`,
    };
    return (
      <div>
        <div role="status" className="rounded-xl3 bg-schw-night p-7 text-schw-cream sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Gelukt</p>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Jullie staan in de agenda!</h2>
          <p className="mt-4 text-lg text-schw-cream/85">
            {act.naam} op {dagNaam(klaar.datum, { weekday: "long", day: "numeric", month: "long" })} om {klaar.tijd} uur, {klaar.personen} personen.
            {klaar.prijs !== null && <> Indicatie: {euro(klaar.prijs)}.</>}
          </p>
          <p className="mt-2 text-schw-cream/70">
            Reserveringsnummer <strong className="font-mono text-schw-sun">{klaar.id}</strong>. Het Schwarzwald bevestigt de reservering.
            {bekend && <> Je vindt hem terug onder <Link href={`${BASE}/account`} className="underline">Mijn account</Link>.</>}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
              Zet in Google Agenda
            </a>
            <a href={klaar.ics} className="rounded-full border border-white/20 px-6 py-3 font-semibold">
              Zet in Apple Agenda (iPhone)
            </a>
            <a href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/20 px-6 py-3 font-semibold">
              Zet in Outlook
            </a>
            <DeelUitje pad={klaar.deel} tekst={deelTekst(act.naam, klaar.datum, klaar.tijd)} licht />
            <button
              type="button"
              onClick={() => {
                setKlaar(null);
                setDatum("");
                setVervers((v) => v + 1);
                setGegevens((g) => ({ ...g, opmerking: "", akkoord: false }));
              }}
              className="rounded-full px-6 py-3 font-semibold text-schw-cream/80 underline underline-offset-4"
            >
              Nog een reservering
            </button>
          </div>
          <p className="mt-6 text-xs text-schw-cream/50">Dit is een ontwerpvoorstel: de reservering is een proefboeking en wordt na 30 dagen gewist.</p>
        </div>
        <BlijfEten boeking={{ id: klaar.id, activiteit: klaar.activiteit, datum: klaar.datum, tijd: klaar.tijd, personen: klaar.personen }} />
      </div>
    );
  }

  return (
    <form onSubmit={bevestig} className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        {/* 1. activiteit en groep */}
        <section className="rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8">
          <h2 className={STAP}>1. Wat gaan jullie doen?</h2>
          <div role="radiogroup" aria-label="Activiteit" className="mt-4 flex flex-wrap gap-2">
            {activiteiten.map((a) => (
              <button
                key={a.slug}
                type="button"
                role="radio"
                aria-checked={a.slug === slug}
                onClick={() => {
                  setSlug(a.slug);
                  setDatum("");
                  setPersonen((p) => Math.min(Math.max(p, a.min), a.max));
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  a.slug === slug ? "bg-schw-night text-schw-cream" : "bg-schw-sand text-schw-night hover:bg-schw-sun"
                }`}
              >
                {a.naam}
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <span id="schw-personen" className="font-semibold">Aantal personen</span>
            <div className="flex items-center rounded-full ring-1 ring-schw-night/15" role="group" aria-labelledby="schw-personen">
              <button type="button" aria-label="Eén minder" onClick={() => setPersonen((p) => Math.max(1, p - 1))} className="grid h-11 w-11 place-items-center text-xl font-bold">
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                aria-label="Aantal personen"
                value={personen}
                min={1}
                max={500}
                onChange={(e) => setPersonen(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                className="w-14 border-0 bg-transparent text-center text-lg font-bold focus:outline-none"
              />
              <button type="button" aria-label="Eén meer" onClick={() => setPersonen((p) => Math.min(500, p + 1))} className="grid h-11 w-11 place-items-center text-xl font-bold">
                +
              </button>
            </div>
            {act && <span className="text-sm text-schw-mute">Online {act.min} tot {act.max} personen</span>}
          </div>
          {act && !groepOk && (
            <p role="alert" className="mt-3 text-sm font-semibold text-[#B91C1C]">
              {personen < act.min ? `${act.naam} kan vanaf ${act.min} personen.` : `Voor meer dan ${act.max} personen: bel ons op ${CONTACT.telefoon}.`}
            </p>
          )}
        </section>

        {/* 2. dag */}
        <section className="rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8" aria-busy={laden}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={`${STAP} shrink-0`}>2. Kies een dag</h2>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!magTerug} onClick={() => setMaand((m) => volgendeMaand(m, -1))} aria-label="Vorige maand" className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-schw-night/15 disabled:opacity-30">
                ‹
              </button>
              <span className="min-w-[9rem] text-center font-semibold capitalize">{maand ? dagNaam(`${maand}-01`, { month: "long", year: "numeric" }) : "…"}</span>
              <button type="button" disabled={!magVooruit} onClick={() => setMaand((m) => volgendeMaand(m, 1))} aria-label="Volgende maand" className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-schw-night/15 disabled:opacity-30">
                ›
              </button>
            </div>
          </div>
          <div className={`mt-5 grid grid-cols-7 gap-1.5 text-center transition-opacity ${laden || !groepOk ? "opacity-40" : ""}`}>
            {WEEKDAGEN.map((w) => (
              <span key={w} className="pb-1 text-xs font-bold uppercase text-schw-mute">{w}</span>
            ))}
            {rooster.map((d, i) =>
              d ? (
                <button
                  key={d.datum}
                  type="button"
                  disabled={(d.status !== "vrij" && d.status !== "vol") || !groepOk}
                  onClick={() => setDatum(d.datum)}
                  aria-pressed={datum === d.datum}
                  aria-label={`${dagNaam(d.datum, { weekday: "long", day: "numeric", month: "long" })}: ${d.status === "vrij" ? "beschikbaar" : d.status === "vol" ? "vol, wachtlijst mogelijk" : "niet beschikbaar"}`}
                  className={`aspect-square rounded-xl text-sm font-semibold transition-colors ${
                    datum === d.datum
                      ? "bg-schw-orange text-schw-night"
                      : d.status === "vrij"
                        ? "bg-schw-cream hover:bg-schw-sun"
                        : d.status === "vol"
                          ? "bg-[#FDE2E2] text-[#B91C1C] line-through"
                          : "text-schw-night/25"
                  }`}
                >
                  {Number(d.datum.slice(8))}
                </button>
              ) : (
                <span key={`leeg-${i}`} />
              ),
            )}
          </div>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-schw-mute">
            <span><span className="mr-1.5 inline-block h-3 w-3 rounded bg-schw-cream ring-1 ring-schw-night/15 align-middle" />beschikbaar</span>
            <span><span className="mr-1.5 inline-block h-3 w-3 rounded bg-[#FDE2E2] align-middle" />vol (wachtlijst mogelijk)</span>
            <span>Grijs: gesloten. Ma en di alleen voor groepen vanaf 12 personen.</span>
          </p>
        </section>

        {/* 3. tijd */}
        <section className="rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8">
          <h2 className={STAP}>3. Kies een tijd</h2>
          {!datum ? (
            <p className="mt-3 text-schw-mute">Kies eerst een dag in de kalender.</p>
          ) : sloten === null ? (
            <p className="mt-3 text-schw-mute">Tijden laden…</p>
          ) : (
            <div role="radiogroup" aria-label="Begintijd" className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {sloten.map((s) => (
                <button
                  key={s.tijd}
                  type="button"
                  role="radio"
                  aria-checked={tijd === s.tijd}
                  disabled={s.status === "vol"}
                  onClick={() => setTijd(s.tijd)}
                  className={`rounded-2xl px-2 py-3 text-center transition-colors disabled:cursor-not-allowed ${
                    tijd === s.tijd ? "bg-schw-orange text-schw-night" : s.status === "vol" ? "bg-schw-sand/60 text-schw-night/30 line-through" : "bg-schw-cream hover:bg-schw-sun"
                  }`}
                >
                  <span className="block font-bold">{s.tijd}</span>
                  <span className="block text-[11px]">{s.status === "vol" ? "vol" : s.status === "bijna-vol" ? "bijna vol" : "vrij"}</span>
                </button>
              ))}
            </div>
          )}
          {act && datum && sloten && sloten.some((s) => s.status === "vol") && (
            <WachtlijstAanmelding
              key={`${slug}-${datum}-${personen}`}
              activiteit={slug}
              naam={act.naam}
              datum={datum}
              personen={personen}
              volleTijden={sloten.filter((s) => s.status === "vol").map((s) => s.tijd)}
              bekend={bekend}
            />
          )}
        </section>

        {/* 4. gegevens */}
        <section className="rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8">
          <h2 className={STAP}>4. Jullie gegevens</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold">Naam</span>
              <input required autoComplete="name" value={gegevens.naam} onChange={(e) => setGegevens({ ...gegevens, naam: e.target.value })} className={VELD} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Telefoonnummer</span>
              <input required type="tel" autoComplete="tel" value={gegevens.telefoon} onChange={(e) => setGegevens({ ...gegevens, telefoon: e.target.value })} className={VELD} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold">E-mailadres</span>
              <input required type="email" autoComplete="email" value={gegevens.email} onChange={(e) => setGegevens({ ...gegevens, email: e.target.value })} className={VELD} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold">Opmerking (mag leeg)</span>
              <textarea
                rows={3}
                value={gegevens.opmerking}
                onChange={(e) => setGegevens({ ...gegevens, opmerking: e.target.value })}
                placeholder="Bijvoorbeeld: graag met BBQ of hittesteen erna, of een dieetwens."
                className={VELD}
              />
            </label>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" required checked={gegevens.akkoord} onChange={(e) => setGegevens({ ...gegevens, akkoord: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[#FF5F1F]" />
            <span>Ik begrijp dat dit een ontwerpvoorstel is: deze reservering is een proefboeking, er wordt niemand gemaild en mijn gegevens worden na 30 dagen gewist.</span>
          </label>
        </section>
      </div>

      {/* samenvatting */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-xl3 bg-schw-night p-6 text-schw-cream sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Jullie reservering</p>
          <dl className="mt-5 space-y-3">
            {(
              [
                ["Activiteit", act?.naam ?? "–"],
                ["Groep", `${personen} personen`],
                ["Dag", datum ? dagNaam(datum, { weekday: "long", day: "numeric", month: "long" }) : "nog kiezen"],
                ["Tijd", tijd ? `${tijd} – ${eindTijd(tijd, act?.duurMin ?? 60)} uur` : "nog kiezen"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-white/10 pb-3">
                <dt className="text-schw-cream/60">{k}</dt>
                <dd className="text-right font-semibold first-letter:uppercase">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 font-display text-3xl font-bold">{datum && prijs !== null ? euro(prijs) : "–"}</p>
          <p className="text-xs text-schw-cream/60">Prijsindicatie voor de activiteit, zonder eten en drinken.</p>
          {fout && (
            <p role="alert" className="mt-4 rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
              {fout}
            </p>
          )}
          <button
            type="submit"
            disabled={!datum || !tijd || !groepOk || bezig}
            className="mt-6 w-full rounded-full bg-schw-orange py-4 font-bold text-schw-night transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-40"
          >
            {bezig ? "Bezig…" : "Bevestig reservering"}
          </button>
        </div>
      </aside>
    </form>
  );
}
