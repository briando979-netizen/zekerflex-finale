"use client";

import { useEffect, useMemo, useState } from "react";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, Melding, dagNaam, euro, useBeheerData, vraag } from "@/components/voorstel/beheer/api";
import { verzetTekst, type BeheerBoeking, type Status } from "@/components/voorstel/beheer/Reserveringen";
import { indelen, maandagVan, minuten, plusDagen, weekDagen } from "@/lib/voorstel/schwarzwald-planning";

// Weekplanning: één kolom per dag, een blok per reservering op zijn tijd en
// met zijn duur. Wat tegelijk loopt staat naast elkaar. Klik op een blok voor
// de details, bevestigen/annuleren en het klantdossier.

const VAN = 10 * 60;
const TOT = 23 * 60;
const PX_PER_UUR = 56;
const px = (min: number) => (min / 60) * PX_PER_UUR;

const KLEUREN = ["#FF5F1F", "#1C3A2B", "#3730A3", "#B45309", "#0F766E", "#9D174D", "#4D7C0F", "#7C3AED", "#0369A1", "#B91C1C", "#A16207", "#334155", "#C2410C"];

function isoWeek(datum: string): number {
  const d = new Date(`${datum}T00:00:00Z`);
  const dag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dag + 3);
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

/** Minuten na middernacht, nu, in Nederlandse tijd. */
function nuInAmsterdam(): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
}

export function Planning({
  namen,
  duur,
  vandaag,
  openKlant,
}: {
  namen: Record<string, string>;
  duur: Record<string, number>;
  vandaag: string;
  openKlant: (email: string) => void;
}) {
  const { data, setData, fout, setFout, laad } = useBeheerData<{ boekingen: BeheerBoeking[] }>(BEHEER_API);
  const [maandag, setMaandag] = useState(maandagVan(vandaag));
  const [geannuleerd, setGeannuleerd] = useState(false);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nu, setNu] = useState<number | null>(null);

  // pas na het laden in de browser: voorkomt een verschil tussen server en browser
  useEffect(() => {
    setNu(nuInAmsterdam());
    const t = window.setInterval(() => setNu(nuInAmsterdam()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const kleurVan = useMemo(() => {
    const slugs = Object.keys(namen);
    return (slug: string) => KLEUREN[Math.max(0, slugs.indexOf(slug)) % KLEUREN.length] ?? "#1C3A2B";
  }, [namen]);

  const dagen = weekDagen(maandag);
  const perDag = useMemo(() => {
    const m = new Map<string, ReturnType<typeof indelen<BeheerBoeking & { duurMin: number }>>>();
    for (const d of dagen) {
      const items = (data?.boekingen ?? [])
        .filter((b) => b.datum === d && (geannuleerd || b.status !== "geannuleerd"))
        .map((b) => ({ ...b, duurMin: duur[b.activiteit] ?? 60 }));
      m.set(d, indelen(items));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, maandag, geannuleerd, duur]);

  const weekBoekingen = dagen.flatMap((d) => perDag.get(d) ?? []).map((g) => g.item);
  const inDezeWeek = new Set(weekBoekingen.map((b) => b.activiteit));
  const keuze = weekBoekingen.find((b) => `${b.datum}-${b.id}` === gekozen) ?? null;

  async function zet(b: BeheerBoeking, status: Status) {
    try {
      await vraag(BEHEER_API, { method: "PATCH", body: { datum: b.datum, id: b.id, status } });
      setData((d) => (d ? { boekingen: d.boekingen.map((x) => (x.id === b.id && x.datum === b.datum ? { ...x, status } : x)) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-display text-xl font-bold">
          Week {isoWeek(maandag)} · {dagNaam(maandag, { day: "numeric", month: "long" })} – {dagNaam(plusDagen(maandag, 6), { day: "numeric", month: "long", year: "numeric" })}
        </h3>
        <button type="button" onClick={() => setMaandag(plusDagen(maandag, -7))} className={KNOP_LICHT} aria-label="Vorige week">
          ‹ Vorige
        </button>
        <button type="button" onClick={() => setMaandag(maandagVan(vandaag))} className={KNOP_LICHT}>
          Deze week
        </button>
        <button type="button" onClick={() => setMaandag(plusDagen(maandag, 7))} className={KNOP_LICHT} aria-label="Volgende week">
          Volgende ›
        </button>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={geannuleerd} onChange={(e) => setGeannuleerd(e.target.checked)} className="h-4 w-4 accent-[#FF5F1F]" />
          Geannuleerd tonen
        </label>
        <button type="button" onClick={() => void laad()} className={KNOP_LICHT}>
          Vernieuwen
        </button>
      </div>
      <Melding fout={fout} />

      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
        <div className="grid min-w-[920px] grid-cols-[56px_repeat(7,1fr)]">
          <div className="border-b border-schw-night/10" />
          {dagen.map((d) => {
            const gasten = (perDag.get(d) ?? []).filter((g) => g.item.status !== "geannuleerd").reduce((s, g) => s + g.item.personen, 0);
            return (
              <div key={d} className={`border-b border-l border-schw-night/10 px-2 py-2 text-center ${d === vandaag ? "bg-schw-sun/30" : ""}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-schw-mute">{dagNaam(d, { weekday: "short" })}</p>
                <p className="font-display text-lg font-bold">{dagNaam(d, { day: "numeric", month: "short" })}</p>
                <p className="text-xs text-schw-mute">{gasten ? `${gasten} gasten` : "–"}</p>
              </div>
            );
          })}

          {/* tijden */}
          <div className="relative" style={{ height: px(TOT - VAN) }}>
            {Array.from({ length: (TOT - VAN) / 60 }, (_, i) => (
              <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-schw-mute" style={{ top: px(i * 60) }}>
                {String(VAN / 60 + i).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {dagen.map((d) => (
            <div key={d} className={`relative border-l border-schw-night/10 ${d === vandaag ? "bg-schw-sun/10" : ""}`} style={{ height: px(TOT - VAN) }}>
              {Array.from({ length: (TOT - VAN) / 60 }, (_, i) => (
                <div key={i} className="absolute inset-x-0 border-t border-schw-night/5" style={{ top: px(i * 60) }} />
              ))}
              {d === vandaag && nu !== null && nu > VAN && nu < TOT && (
                <div className="absolute inset-x-0 z-20 border-t-2 border-[#B91C1C]" style={{ top: px(nu - VAN) }} aria-hidden="true" />
              )}
              {(perDag.get(d) ?? []).map((g) => {
                const b = g.item;
                const sleutel = `${b.datum}-${b.id}`;
                return (
                  <button
                    key={sleutel}
                    type="button"
                    onClick={() => setGekozen(gekozen === sleutel ? null : sleutel)}
                    aria-label={`${b.tijd} ${namen[b.activiteit] ?? b.activiteit}, ${b.personen} personen, ${b.naam}, ${b.status}`}
                    className={`absolute z-10 overflow-hidden rounded-lg px-1.5 py-1 text-left text-[11px] leading-tight text-white shadow-sm transition-transform hover:z-30 hover:scale-[1.02] ${
                      b.status === "nieuw" ? "ring-2 ring-schw-sun ring-offset-1" : ""
                    } ${b.status === "geannuleerd" ? "opacity-40 line-through" : ""} ${gekozen === sleutel ? "z-30 outline outline-2 outline-schw-night" : ""}`}
                    style={{
                      top: px(Math.max(0, g.start - VAN)) + 1,
                      height: Math.max(22, px(g.eind - g.start) - 2),
                      left: `calc(${(g.baan / g.banen) * 100}% + 2px)`,
                      width: `calc(${100 / g.banen}% - 4px)`,
                      background: kleurVan(b.activiteit),
                    }}
                  >
                    <strong className="block truncate">
                      {b.tijd} {namen[b.activiteit] ?? b.activiteit}
                    </strong>
                    <span className="block truncate opacity-90">
                      {b.personen} p · {b.naam}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {inDezeWeek.size > 0 && (
        <ul className="flex flex-wrap gap-3 text-xs text-schw-mute" aria-label="Kleuren per activiteit">
          {[...inDezeWeek].map((slug) => (
            <li key={slug} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded" style={{ background: kleurVan(slug) }} />
              {namen[slug] ?? slug}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded ring-2 ring-schw-sun" /> nog te bevestigen
          </li>
        </ul>
      )}
      {data && weekBoekingen.length === 0 && <p className="text-sm text-schw-mute">Geen reserveringen in deze week.</p>}

      {keuze && (
        <section className={KAART} aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-schw-mute">{keuze.status}</p>
              <h4 className="mt-1 font-display text-xl font-bold">
                {namen[keuze.activiteit] ?? keuze.activiteit} · {keuze.personen} personen
              </h4>
              <p className="text-schw-mute first-letter:uppercase">
                {dagNaam(keuze.datum)} · {keuze.tijd}
                {keuze.prijs !== null && <> · {euro(keuze.prijs)}</>} · nr. {keuze.id}
              </p>
              <p className="mt-2">
                {keuze.naam} · <a href={`tel:${keuze.telefoon}`} className="underline">{keuze.telefoon}</a> ·{" "}
                <a href={`mailto:${keuze.email}`} className="underline">{keuze.email}</a>
              </p>
              {keuze.opmerking && <p className="mt-2">&ldquo;{keuze.opmerking}&rdquo;</p>}
              {keuze.verzetVan && <p className="mt-2 font-semibold text-schw-orange">{verzetTekst(keuze.verzetVan)}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {keuze.status !== "bevestigd" && (
                <button type="button" onClick={() => void zet(keuze, "bevestigd")} className={KNOP}>
                  Bevestig
                </button>
              )}
              {keuze.status !== "geannuleerd" && (
                <button type="button" onClick={() => void zet(keuze, "geannuleerd")} className={KNOP_LICHT}>
                  Annuleer
                </button>
              )}
              <button type="button" onClick={() => openKlant(keuze.email)} className={KNOP_LICHT}>
                Open klant
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
