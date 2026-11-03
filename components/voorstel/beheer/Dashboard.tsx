"use client";

import { useMemo } from "react";
import { AANVRAAG_STATUS, BEHEER_API, KAART, Melding, Pil, dagNaam, euro, useBeheerData, vraag, type AanvraagStatus } from "@/components/voorstel/beheer/api";

// Het dashboard van het beheer: bovenaan "Te doen" (alles wat aandacht vraagt,
// klik = naar het tabblad), dan cijfers, drukte per dag, populaire
// activiteiten, de aanvragen-pijplijn, en wat het team vandaag moet weten
// (wensen van gasten, taken, onbeantwoorde berichten, nieuwe aanvragen).

interface Som {
  aantal: number;
  gasten: number;
  omzet: number;
}
interface Cijfers {
  vandaag: string;
  vandaagCijfers: Som;
  balie: { verwacht: number; binnen: number; nietGekomen: number; open: number };
  week: Som;
  maand: Som;
  teBevestigen: number;
  perDag: { datum: string; gasten: number; reserveringen: number }[];
  topActiviteiten: { slug: string; gasten: number; omzet: number }[];
  pijplijn: { status: AanvraagStatus; aantal: number; waarde: number }[];
  conversie: number | null;
  nieuweAanvragen: { id: string; naam: string; email: string; programma: string; gelegenheid: string; personen: number; datum: string; aangemaakt: string }[];
  klanten: { totaal: number; metAccount: number; vast: number; wachtOpAntwoord: { email: string; naam: string }[] };
  wensen: { id: string; datum: string; tijd: string; activiteit: string; personen: number; naam: string; opmerking: string; klantwens: string }[];
  taken: { id: string; email: string; naam: string; tekst: string; vervalt?: string }[];
  teDoen: { sleutel: string; aantal: number; tekst: string; tab: string }[];
}

type Doel = "reserveringen" | "aanvragen" | "klanten" | "activiteiten" | "wachtlijst" | "sollicitaties" | "reviews";
const DOELEN: readonly string[] = ["reserveringen", "aanvragen", "klanten", "activiteiten", "wachtlijst", "sollicitaties", "reviews"];

export function Dashboard({ namen, naar, openKlant }: { namen: Record<string, string>; naar: (t: Doel) => void; openKlant: (email: string) => void }) {
  const { data, fout, setFout, laad } = useBeheerData<Cijfers>(`${BEHEER_API}/dashboard`);
  const maxGasten = useMemo(() => Math.max(1, ...(data?.perDag.map((d) => d.gasten) ?? [1])), [data]);
  const maxTop = useMemo(() => Math.max(1, ...(data?.topActiviteiten.map((d) => d.gasten) ?? [1])), [data]);

  if (!data) return <Melding fout={fout} />;

  async function taakKlaar(email: string, id: string) {
    try {
      await vraag(`${BEHEER_API}/klanten`, { method: "POST", body: { actie: "taak", email, id, klaar: true } });
      void laad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    }
  }

  const blokken: [string, Som][] = [
    ["Vandaag", data.vandaagCijfers],
    ["Komende 7 dagen", data.week],
    ["Deze maand", data.maand],
  ];

  return (
    <div className="space-y-6">
      <section className={KAART} aria-labelledby="dash-te-doen">
        <h3 id="dash-te-doen" className="font-display text-lg font-bold">
          Te doen
        </h3>
        {data.teDoen.length === 0 ? (
          <p className="mt-2 text-schw-mute">Alles bijgewerkt: er wacht niets op je.</p>
        ) : (
          <ul className="mt-3 divide-y divide-schw-night/10">
            {data.teDoen.map((p) => (
              <li key={p.sleutel}>
                <button
                  type="button"
                  onClick={() => (DOELEN.includes(p.tab) ? naar(p.tab as Doel) : document.getElementById("dash-taken")?.scrollIntoView({ behavior: "smooth" }))}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left font-semibold hover:text-schw-rust"
                >
                  <span>{p.tekst}</span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="grid gap-3 lg:grid-cols-3">
        {blokken.map(([titel, s]) => (
          <div key={titel} className={KAART}>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-schw-mute">{titel}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <p className="font-display text-3xl font-bold">{s.aantal}</p>
                <p className="text-xs text-schw-mute">reserveringen</p>
              </div>
              <div>
                <p className="font-display text-3xl font-bold">{s.gasten}</p>
                <p className="text-xs text-schw-mute">gasten</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold">{euro(s.omzet)}</p>
                <p className="text-xs text-schw-mute">omzetindicatie</p>
              </div>
            </div>
            {titel === "Vandaag" && data.balie.verwacht > 0 && (
              <button type="button" onClick={() => naar("reserveringen")} className="mt-3 text-left text-sm font-semibold hover:text-schw-rust">
                Bij de balie: {data.balie.binnen} van {data.balie.verwacht} gasten binnen
                {data.balie.nietGekomen > 0 && <> · {data.balie.nietGekomen} niet gekomen</>} ›
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Te bevestigen", data.teBevestigen, "reserveringen"],
            ["Nieuwe aanvragen", data.pijplijn.find((p) => p.status === "nieuw")?.aantal ?? 0, "aanvragen"],
            ["Klanten", `${data.klanten.totaal} (${data.klanten.vast} vast)`, "klanten"],
            ["Conversie aanvragen", data.conversie === null ? "–" : `${data.conversie}%`, "aanvragen"],
          ] as const
        ).map(([k, v, doel]) => (
          <button key={k} type="button" onClick={() => naar(doel)} className={`${KAART} text-left hover:ring-2 hover:ring-schw-orange`}>
            <p className="text-sm text-schw-mute">{k}</p>
            <p className="mt-1 font-display text-3xl font-bold">{v}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className={KAART}>
          <h3 className="font-display text-lg font-bold">Gasten per dag, komende 14 dagen</h3>
          <div className="mt-5 flex h-48 items-end gap-1.5" role="img" aria-label="Staafgrafiek van het aantal gasten per dag">
            {data.perDag.map((d) => (
              <div key={d.datum} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold text-schw-mute">{d.gasten || ""}</span>
                <div
                  title={`${dagNaam(d.datum)}: ${d.gasten} gasten, ${d.reserveringen} reserveringen`}
                  className={`w-full rounded-t-md ${d.datum === data.vandaag ? "bg-schw-orange" : "bg-schw-forest"}`}
                  style={{ height: `${Math.max(2, (d.gasten / maxGasten) * 100)}%` }}
                />
                <span className="text-[10px] text-schw-mute">{dagNaam(d.datum, { weekday: "narrow" })}</span>
              </div>
            ))}
          </div>
        </section>
        <section className={KAART}>
          <h3 className="font-display text-lg font-bold">Populairste activiteiten</h3>
          {data.topActiviteiten.length === 0 && <p className="mt-3 text-sm text-schw-mute">Nog geen reserveringen.</p>}
          <ul className="mt-4 space-y-3">
            {data.topActiviteiten.map((a) => (
              <li key={a.slug}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{namen[a.slug] ?? a.slug}</span>
                  <span className="text-schw-mute">
                    {a.gasten} gasten · {euro(a.omzet)}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-schw-sand">
                  <div className="h-2 rounded-full bg-schw-orange" style={{ width: `${(a.gasten / maxTop) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={KAART}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">Aanvragen-pijplijn</h3>
          <button type="button" onClick={() => naar("aanvragen")} className="text-sm font-semibold underline decoration-schw-orange decoration-2 underline-offset-4">
            Naar aanvragen
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {data.pijplijn.map((p) => (
            <div key={p.status} className="rounded-2xl bg-schw-cream p-4">
              <Pil label={AANVRAAG_STATUS[p.status][0]} kleur={AANVRAAG_STATUS[p.status][1]} />
              <p className="mt-2 font-display text-2xl font-bold">{p.aantal}</p>
              <p className="text-xs text-schw-mute">{p.waarde ? euro(p.waarde) : "–"}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={KAART}>
          <h3 className="font-display text-lg font-bold">Wensen van gasten, komende 7 dagen</h3>
          <p className="mt-1 text-sm text-schw-mute">Voor keuken en begeleiding: opmerkingen bij reserveringen en vaste wensen uit het klantprofiel.</p>
          {data.wensen.length === 0 && <p className="mt-4 text-sm text-schw-mute">Geen bijzondere wensen.</p>}
          <ul className="mt-4 space-y-3">
            {data.wensen.map((w) => (
              <li key={`${w.datum}-${w.id}`} className="rounded-2xl bg-schw-cream p-4 text-sm">
                <p className="font-bold first-letter:uppercase">
                  {dagNaam(w.datum, { weekday: "short", day: "numeric", month: "short" })} {w.tijd} · {namen[w.activiteit] ?? w.activiteit} · {w.personen} pers. · {w.naam}
                </p>
                {w.opmerking && <p className="mt-1">&ldquo;{w.opmerking}&rdquo;</p>}
                {w.klantwens && <p className="mt-1 text-schw-mute">Vaste wens: {w.klantwens}</p>}
              </li>
            ))}
          </ul>
        </section>
        <section id="dash-taken" className={`${KAART} scroll-mt-24`}>
          <h3 className="font-display text-lg font-bold">Taken</h3>
          {data.taken.length === 0 && <p className="mt-3 text-sm text-schw-mute">Geen open taken.</p>}
          <ul className="mt-4 space-y-2">
            {data.taken.map((t) => {
              const telaat = !!t.vervalt && t.vervalt < data.vandaag;
              return (
                <li key={t.id} className="flex items-start gap-3 rounded-2xl bg-schw-cream p-3 text-sm">
                  <input type="checkbox" aria-label={`Taak afronden: ${t.tekst}`} onChange={() => void taakKlaar(t.email, t.id)} className="mt-0.5 h-5 w-5 accent-[#FF5F1F]" />
                  <div className="flex-1">
                    <p className="font-semibold">{t.tekst}</p>
                    <button type="button" onClick={() => openKlant(t.email)} className="text-schw-mute underline">
                      {t.naam}
                    </button>
                  </div>
                  {t.vervalt && (
                    <span className={`shrink-0 text-xs font-bold ${telaat ? "text-[#B91C1C]" : "text-schw-mute"}`}>
                      {telaat ? "te laat · " : ""}
                      {dagNaam(t.vervalt, { day: "numeric", month: "short" })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {data.klanten.wachtOpAntwoord.length > 0 && (
            <>
              <h4 className="mt-6 text-sm font-bold uppercase tracking-wide text-schw-mute">Wachten op antwoord</h4>
              <ul className="mt-2 flex flex-wrap gap-2">
                {data.klanten.wachtOpAntwoord.map((k) => (
                  <li key={k.email}>
                    <button type="button" onClick={() => openKlant(k.email)} className="rounded-full bg-schw-sun px-3 py-1.5 text-sm font-semibold text-schw-night">
                      {k.naam || k.email}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className={KAART}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">Nieuwe aanvragen</h3>
          <button type="button" onClick={() => naar("aanvragen")} className="text-sm font-semibold underline decoration-schw-orange decoration-2 underline-offset-4">
            Alle aanvragen
          </button>
        </div>
        {data.nieuweAanvragen.length === 0 && <p className="mt-3 text-sm text-schw-mute">Geen nieuwe aanvragen.</p>}
        <ul className="mt-3 divide-y divide-schw-night/5">
          {data.nieuweAanvragen.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>
                <strong>{a.naam}</strong> · {a.programma || a.gelegenheid || "op maat"} · {a.personen} pers.{a.datum ? ` · ${dagNaam(a.datum, { day: "numeric", month: "short" })}` : ""}
              </span>
              <button type="button" onClick={() => openKlant(a.email)} className="font-semibold underline">
                Open klant
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
