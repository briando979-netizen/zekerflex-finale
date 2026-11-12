"use client";

import { useEffect, useState } from "react";
import type { DagLes, InstructeurWeergave } from "@/lib/rijschool/weergave";
import type { Beoordelingen } from "@/lib/rijschool/leskaart";
import { FASES, onderdeelVan, SCORES } from "@/lib/rijschool/leskaart";
import { bedragVeld, centVan, foutVan, stuur } from "@/components/rijschool/api";
import { LesStatus, Melding, Veld, Voortgangsbalk } from "@/components/rijschool/ui";
import { datumLang, SOORT_LABEL, tijd } from "@/lib/rijschool/format";
import { tegoedTekst } from "@/lib/rijschool/tegoed";
import { plusDagen } from "@/lib/rijschool/planning";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { whatsappNummer } from "@/lib/rijschool/whatsapp";
import { afstandTekst } from "@/lib/kaart/geo";
import { RouteOpnemen } from "@/components/rijschool/instructeur/RouteOpnemen";

// Het scherm van één les in de instructeur-app: alles wat je in de auto
// nodig hebt, van route en klok tot leskaart, huiswerk, afronden, de volgende
// les en een betaling.

type Actie = (body: Record<string, unknown>, melding: string) => Promise<boolean>;

export function LesScherm({ les, d, api, actie, onTerug }: { les: DagLes; d: InstructeurWeergave; api: string; actie: Actie; onTerug: () => void }) {
  const kleur = d.rijschool.kleur;
  const l = les.leerling;
  const [beoordeling, setBeoordeling] = useState<Beoordelingen>(les.beoordeling);
  const [verslag, setVerslag] = useState(les.verslag);
  const [huiswerk, setHuiswerk] = useState<string[]>(les.huiswerk);
  const [intern, setIntern] = useState(les.interneNotitie);
  const [gewijzigd, setGewijzigd] = useState(false);
  const [uitleg, setUitleg] = useState<string | null>(null);
  const [faseOpen, setFaseOpen] = useState<string | null>(l?.voortgang.aandacht[0] ? (onderdeelVan(l.voortgang.aandacht[0])?.fase.sleutel ?? null) : (FASES[0]?.sleutel ?? null));
  const [minuten, setMinuten] = useState<number | null>(null);

  // de klok sinds de start van de les
  useEffect(() => {
    if (!les.gestartOm) return;
    const zet = () => setMinuten(Math.max(0, Math.floor((Date.now() - new Date(les.gestartOm ?? 0).getTime()) / 60_000)));
    zet();
    const t = setInterval(zet, 30_000);
    return () => clearInterval(t);
  }, [les.gestartOm]);

  function score(sleutel: string, s: number) {
    const huidig = beoordeling[sleutel];
    const bij = { ...beoordeling };
    if (huidig?.score === s) delete bij[sleutel];
    else bij[sleutel] = { score: s, ...(huidig?.notitie ? { notitie: huidig.notitie } : {}) };
    setBeoordeling(bij);
    setGewijzigd(true);
  }

  function notitie(sleutel: string, n: string) {
    const huidig = beoordeling[sleutel];
    if (!huidig) return;
    setBeoordeling({ ...beoordeling, [sleutel]: n ? { score: huidig.score, notitie: n } : { score: huidig.score } });
    setGewijzigd(true);
  }

  function wisselHuiswerk(sleutel: string) {
    setHuiswerk(huiswerk.includes(sleutel) ? huiswerk.filter((h) => h !== sleutel) : [...huiswerk, sleutel].slice(0, 10));
    setGewijzigd(true);
  }

  const leskaartBody = { actie: "leskaart", lesId: les.id, beoordeling, verslag, huiswerk, interneNotitie: intern };
  const bewaar = async () => {
    if (await actie(leskaartBody, "Leskaart opgeslagen.")) setGewijzigd(false);
  };
  async function rondAf(status: "VOLTOOID" | "NIET_VERSCHENEN") {
    if (status === "NIET_VERSCHENEN" && !window.confirm("Leerling niet verschenen? De les gaat van het tegoed af.")) return;
    if (gewijzigd && !(await actie(leskaartBody, "Leskaart opgeslagen."))) return;
    setGewijzigd(false);
    await actie({ actie: "afronden", lesId: les.id, status }, status === "VOLTOOID" ? "Les afgerond. De leerling ziet je verslag en huiswerk in de app." : "Vastgelegd als niet verschenen.");
  }

  const route = les.ophaaladres ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(les.ophaaladres)}` : null;
  const tel = l?.telefoon ? `tel:${l.telefoon.replace(/[^0-9+]/g, "")}` : null;
  const wa = l?.telefoon ? whatsappNummer(l.telefoon) : null;
  const aandacht = l?.voortgang.aandacht.slice(0, 5) ?? [];

  return (
    <div className="space-y-4">
      <button type="button" className="text-sm font-semibold underline underline-offset-2" onClick={onTerug}>
        ← Lesdag
      </button>

      <section className="rounded-2xl p-5 text-white" style={{ background: kleur }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-white/80">
              {SOORT_LABEL[les.soort]} · {tijd(les.start)} – {tijd(les.eind)}
            </p>
            <h1 className="truncate font-display text-2xl font-bold">{les.leerlingNaam ?? "Geen leerling"}</h1>
          </div>
          <LesStatus status={les.status} />
        </div>
        {les.ophaaladres && <p className="mt-2 text-sm text-white/90">Ophalen: {les.ophaaladres}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {route && (
            <a href={route} target="_blank" rel="noopener" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">
              Route
            </a>
          )}
          {tel && (
            <a href={tel} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">
              Bellen
            </a>
          )}
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener" className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">
              WhatsApp
            </a>
          )}
          {les.status === "GEPLAND" &&
            (les.gestartOm ? (
              <span className="num rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">Bezig: {minuten ?? 0} min</span>
            ) : (
              <button type="button" className="rounded-full px-4 py-2 text-sm font-semibold text-ink" style={{ background: d.rijschool.accent }} onClick={() => actie({ actie: "start", lesId: les.id }, "Les gestart.")}>
                Start les
              </button>
            ))}
        </div>
      </section>

      {/* lesroute: opnemen tijdens de gestarte les (lib/rijschool/lesroute.ts) */}
      {l && les.status === "GEPLAND" && les.gestartOm && <RouteOpnemen api={api} datum={d.datum} lesId={les.id} meters={les.routeMeters} />}
      {l && les.status === "VOLTOOID" && les.routeMeters > 0 && (
        <p className="rounded-2xl border border-hair bg-white p-4 text-sm">
          <span className="font-semibold">Lesroute:</span> {afstandTekst(les.routeMeters)} opgenomen. De leerling ziet hem in de app.
        </p>
      )}

      {l && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-hair bg-white p-4">
            <p className="text-xs text-neutralx-500">Voortgang</p>
            <p className="num font-display text-2xl font-bold">{l.voortgang.procent}%</p>
            <Voortgangsbalk procent={l.voortgang.procent} kleur={kleur} label="Voortgang" />
            {l.voortgang.examenklaar && <p className="pill-ok mt-2">Klaar voor het examen</p>}
          </div>
          <div className="rounded-2xl border border-hair bg-white p-4">
            <p className="text-xs text-neutralx-500">Tegoed{l.automaat ? " · automaat" : ""}</p>
            <p className={`font-display text-lg font-bold ${l.saldoMin < 0 ? "text-crit" : ""}`}>{tegoedTekst(l.saldoMin, d.rijschool.lesMinuten)}</p>
            {l.saldoMin <= 0 && <p className="text-xs text-crit">Bespreek een nieuw pakket of neem een betaling aan.</p>}
          </div>
          {(l.vorigVerslag || aandacht.length > 0) && (
            <div className="rounded-2xl border border-hair bg-white p-4 sm:col-span-2">
              {l.vorigVerslag && (
                <>
                  <p className="text-xs text-neutralx-500">Vorige les</p>
                  <p className="whitespace-pre-line text-sm">{l.vorigVerslag}</p>
                </>
              )}
              {aandacht.length > 0 && (
                <>
                  <p className="mt-3 text-xs text-neutralx-500">Aandachtspunten</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {aandacht.map((a) => (
                      <li key={a}>
                        <button
                          type="button"
                          className="rounded-full bg-paper-soft px-3 py-1.5 text-sm font-medium ring-1 ring-hair"
                          onClick={() => {
                            setFaseOpen(onderdeelVan(a)?.fase.sleutel ?? null);
                            setUitleg(a);
                          }}
                        >
                          {onderdeelVan(a)?.onderdeel.titel ?? a} · {l.voortgang.stand[a]?.score}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {l && (
        <section className="rounded-2xl border border-hair bg-white">
          <div className="flex items-center justify-between gap-3 p-4">
            <h2 className="font-semibold">Leskaart</h2>
            <span className="text-xs text-neutralx-500">{SCORES.map((s) => `${s.score} ${s.label.toLowerCase()}`).join(" · ")}</span>
          </div>
          {FASES.map((f) => {
            const open = faseOpen === f.sleutel;
            const gedaan = f.onderdelen.filter((o) => beoordeling[o.sleutel]).length;
            return (
              <div key={f.sleutel} className="border-t border-hair">
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open} onClick={() => setFaseOpen(open ? null : f.sleutel)}>
                  <span className="font-medium">{f.titel}</span>
                  <span className="text-sm text-neutralx-500">{gedaan > 0 ? `${gedaan} beoordeeld` : ""} {open ? "−" : "+"}</span>
                </button>
                {open && (
                  <ul className="space-y-3 px-4 pb-4">
                    {f.onderdelen.map((o) => {
                      const b = beoordeling[o.sleutel];
                      const vorig = l.voortgang.stand[o.sleutel];
                      return (
                        <li key={o.sleutel} className="rounded-xl bg-paper-soft p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button type="button" className="text-left text-sm font-semibold underline-offset-2 hover:underline" onClick={() => setUitleg(uitleg === o.sleutel ? null : o.sleutel)} aria-expanded={uitleg === o.sleutel}>
                              {o.titel}
                            </button>
                            <span className="text-xs text-neutralx-500">{vorig ? `vorige keer ${vorig.score}` : "nieuw"}</span>
                          </div>
                          {uitleg === o.sleutel && (
                            <div className="mt-2 rounded-lg bg-white p-3 text-sm">
                              <p>{o.uitleg}</p>
                              <ol className="mt-2 list-decimal space-y-1 pl-5">
                                {o.stappen.map((s) => (
                                  <li key={s}>{s}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                          <div className="mt-2 grid grid-cols-5 gap-1.5" role="group" aria-label={`Score ${o.titel}`}>
                            {SCORES.map((s) => (
                              <button
                                key={s.score}
                                type="button"
                                aria-pressed={b?.score === s.score}
                                title={s.label}
                                onClick={() => score(o.sleutel, s.score)}
                                className={`rounded-lg py-2.5 text-sm font-bold ${b?.score === s.score ? "text-white" : "bg-white ring-1 ring-hair"}`}
                                style={b?.score === s.score ? { background: kleur } : undefined}
                              >
                                {s.score}
                              </button>
                            ))}
                          </div>
                          {b && (
                            <div className="mt-2 flex gap-2">
                              <input
                                className="field-input !mt-0 text-sm"
                                placeholder="Korte notitie voor de leerling (mag leeg)"
                                value={b.notitie ?? ""}
                                onChange={(e) => notitie(o.sleutel, e.target.value)}
                                maxLength={500}
                                aria-label={`Notitie ${o.titel}`}
                              />
                              <button
                                type="button"
                                onClick={() => wisselHuiswerk(o.sleutel)}
                                aria-pressed={huiswerk.includes(o.sleutel)}
                                className={`whitespace-nowrap rounded-lg px-3 text-xs font-semibold ${huiswerk.includes(o.sleutel) ? "text-white" : "bg-white ring-1 ring-hair"}`}
                                style={huiswerk.includes(o.sleutel) ? { background: kleur } : undefined}
                              >
                                Huiswerk
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          <div className="space-y-3 border-t border-hair p-4">
            <Veld label="Verslag voor de leerling">
              <textarea
                className="field-input min-h-[5rem]"
                value={verslag}
                onChange={(e) => {
                  setVerslag(e.target.value);
                  setGewijzigd(true);
                }}
                maxLength={2000}
                placeholder="Wat ging goed, waar werken we de volgende keer aan?"
              />
            </Veld>
            {huiswerk.length > 0 && (
              <p className="text-sm">
                Huiswerk: <strong>{huiswerk.map((h) => onderdeelVan(h)?.onderdeel.titel ?? h).join(", ")}</strong>
              </p>
            )}
            <Veld label="Interne notitie (alleen voor de rijschool)">
              <textarea
                className="field-input min-h-[3.5rem]"
                value={intern}
                onChange={(e) => {
                  setIntern(e.target.value);
                  setGewijzigd(true);
                }}
                maxLength={2000}
              />
            </Veld>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={bewaar} disabled={!gewijzigd}>
                {gewijzigd ? "Tussendoor opslaan" : "Opgeslagen"}
              </button>
              {les.status === "GEPLAND" && (
                <>
                  <button type="button" className="rounded-full px-5 py-2.5 text-sm font-semibold text-white" style={{ background: kleur }} onClick={() => rondAf("VOLTOOID")}>
                    Les afronden
                  </button>
                  <button type="button" className="rounded-full px-4 py-2.5 text-sm font-semibold text-crit ring-1 ring-hair" onClick={() => rondAf("NIET_VERSCHENEN")}>
                    Niet verschenen
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {l && <VolgendeLes les={les} d={d} api={api} actie={actie} />}
      {l && <Betaling leerlingId={l.id} d={d} api={api} actie={actie} />}
    </div>
  );
}

function VolgendeLes({ les, d, api, actie }: { les: DagLes; d: InstructeurWeergave; api: string; actie: Actie }) {
  const [datum, setDatum] = useState(plusDagen(amsterdamDayKey(les.start), 7));
  const [duur, setDuur] = useState(d.rijschool.lesMinuten);
  const [tijden, setTijden] = useState<string[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    setTijden(null);
    setFout(null);
    stuur<{ tijden: string[] }>(`${api}?vrij=${datum}&duur=${duur}`)
      .then((r) => setTijden(r.tijden))
      .catch((e) => setFout(foutVan(e)));
  }, [api, datum, duur]);

  const leerling = les.leerling;
  if (!leerling) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-hair bg-white p-5">
      <h2 className="font-semibold">Volgende les plannen</h2>
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Datum">
          <input className="field-input" type="date" value={datum} onChange={(e) => e.target.value && setDatum(e.target.value)} />
        </Veld>
        <Veld label="Duur (min)">
          <input className="field-input" type="number" min={15} max={300} step={15} value={duur} onChange={(e) => setDuur(Number(e.target.value) || d.rijschool.lesMinuten)} />
        </Veld>
      </div>
      <Melding fout={fout} />
      {tijden === null && !fout && <p className="text-sm text-neutralx-500">Vrije tijden zoeken…</p>}
      {tijden && tijden.length === 0 && <p className="text-sm text-neutralx-600">Je hebt op {datumLang(`${datum}T12:00:00Z`)} geen vrije tijd binnen je werktijden.</p>}
      {tijden && tijden.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tijden.map((t) => (
            <button
              key={t}
              type="button"
              className="num rounded-lg border border-hair px-3 py-2 text-sm font-semibold hover:border-neutralx-300"
              onClick={() =>
                window.confirm(`${leerling.naam} inplannen op ${datumLang(t)} om ${tijd(t)}?`) &&
                void actie({ actie: "plan", leerlingId: leerling.id, datum, tijd: tijd(t), duurMin: duur, voertuigId: les.voertuigId }, `Volgende les ingepland: ${datumLang(t)} om ${tijd(t)}. De leerling krijgt een mail.`)
              }
            >
              {tijd(t)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Betaling({ leerlingId, d, api, actie }: { leerlingId: string; d: InstructeurWeergave; api: string; actie: Actie }) {
  const [productId, setProductId] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [methode, setMethode] = useState<"PIN" | "CONTANT" | "IDEAL">("PIN");
  const [fout, setFout] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  function kies(id: string) {
    setProductId(id);
    const p = d.producten.find((x) => x.id === id);
    if (p) {
      setBedrag(bedragVeld(p.prijsCent));
      setOmschrijving(p.naam);
    }
  }

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setQr(null);
    const cent = centVan(bedrag);
    if (cent === null) return setFout("Vul een bedrag in, bijvoorbeeld 62,50.");
    if (methode === "IDEAL") {
      // de leerling scant de code en betaalt op de eigen telefoon; het tegoed komt erbij na de betaling
      try {
        const { url } = await stuur<{ url: string }>(`${api}?datum=${d.datum}`, "POST", { actie: "ideal", leerlingId, productId: productId || null, bedragCent: cent, omschrijving });
        const QRCode = (await import("qrcode")).default;
        setQr(await QRCode.toDataURL(url, { margin: 1, width: 320 }));
      } catch (err) {
        setFout(foutVan(err));
      }
      return;
    }
    if (await actie({ actie: "betaling", leerlingId, productId: productId || null, bedragCent: cent, methode, omschrijving }, "Betaling vastgelegd.")) {
      setProductId("");
      setBedrag("");
      setOmschrijving("");
    }
  }

  return (
    <form onSubmit={bewaar} className="space-y-3 rounded-2xl border border-hair bg-white p-5">
      <h2 className="font-semibold">Betaling in de auto</h2>
      <Veld label="Pakket">
        <select className="field-input" value={productId} onChange={(e) => kies(e.target.value)}>
          <option value="">Geen pakket (los bedrag)</option>
          {d.producten.map((p) => (
            <option key={p.id} value={p.id}>
              {p.naam}
            </option>
          ))}
        </select>
      </Veld>
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Bedrag (€)">
          <input className="field-input" inputMode="decimal" value={bedrag} onChange={(e) => setBedrag(e.target.value)} required readOnly={methode === "IDEAL" && !!productId} />
        </Veld>
        <Veld label="Betaald met">
          <select className="field-input" value={methode} onChange={(e) => setMethode(e.target.value as "PIN" | "CONTANT" | "IDEAL")}>
            <option value="PIN">Pin</option>
            <option value="CONTANT">Contant</option>
            {d.onlineBetalen && <option value="IDEAL">iDEAL (QR-code)</option>}
          </select>
        </Veld>
      </div>
      <Veld label="Omschrijving">
        <input className="field-input" value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} required minLength={2} maxLength={160} />
      </Veld>
      <Melding fout={fout} />
      {qr && (
        <div className="rounded-xl bg-paper-soft p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR-code als data-adres, gemaakt in de browser */}
          <img src={qr} alt="QR-code om met iDEAL te betalen" width={240} height={240} className="mx-auto h-60 w-60 rounded-lg bg-white" />
          <p className="mt-2 text-sm text-ink">Laat de leerling deze code scannen met de camera van de telefoon en betalen met iDEAL.</p>
          <p className="text-xs text-neutralx-500">Na de betaling staat het meteen in de app van de leerling. Een los bedrag blijft anders openstaan; de leerling kan het later in de app betalen.</p>
        </div>
      )}
      <button type="submit" className={methode === "IDEAL" ? "btn-primary" : "btn-ghost"}>
        {methode === "IDEAL" ? "Toon QR-code" : "Betaling vastleggen"}
      </button>
    </form>
  );
}
