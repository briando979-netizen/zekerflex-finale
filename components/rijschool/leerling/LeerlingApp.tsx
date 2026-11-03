"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { LeerlingLes, LeerlingWeergave } from "@/lib/rijschool/weergave";
import { foutVan, stuur } from "@/components/rijschool/api";
import { LesStatus, Melding, Veld, Voortgangsbalk } from "@/components/rijschool/ui";
import { Leskaart } from "@/components/rijschool/Leskaart";
import { Lesvoorbereiding, TheorieOefenen } from "@/components/rijschool/leerling/Oefenen";
import { datumKort, datumLang, metHoofdletter, METHODE_LABEL, SOORT_LABEL, tijd } from "@/lib/rijschool/format";
import { onderdeelVan } from "@/lib/rijschool/leskaart";
import { tegoedTekst } from "@/lib/rijschool/tegoed";
import { komendeDagen } from "@/lib/rijschool/planning";
import { euro } from "@/lib/payroll/format";
import { afstandTekst, duurTekst } from "@/lib/kaart/geo";
import type { RouteWeergave } from "@/lib/rijschool/lesroute";

// De app van een leerling: volgende les, lessen (annuleren en zelf plannen),
// voortgang per onderdeel, oefenen (lesvoorbereiding en theorie) en tegoed.

type Tab = "overzicht" | "lessen" | "voortgang" | "oefenen" | "tegoed";

const TABS: { id: Tab; label: string; icoon: string }[] = [
  { id: "overzicht", label: "Overzicht", icoon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { id: "lessen", label: "Lessen", icoon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { id: "voortgang", label: "Voortgang", icoon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { id: "oefenen", label: "Oefenen", icoon: "M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h6M8 11h6" },
  { id: "tegoed", label: "Tegoed", icoon: "M3 7h18v12H3zM3 11h18M7 15h3" },
];

export function LeerlingApp({ slug, begin }: { slug: string; begin: LeerlingWeergave }) {
  const router = useRouter();
  const api = `/api/rijschool/site/${slug}/leerling`;
  const [d, setD] = useState(begin);
  const [tab, setTab] = useState<Tab>("overzicht");
  const [uitlegOpen, setUitlegOpen] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const kleur = d.rijschool.kleur;
  const nu = Date.now();

  const komend = d.lessen.filter((l) => l.status === "GEPLAND" && new Date(l.eind).getTime() > nu).sort((a, b) => a.start.localeCompare(b.start));
  const geweest = d.lessen.filter((l) => !komend.includes(l));
  const volgende = komend[0];
  const laatsteGereden = d.lessen.find((l) => l.status === "VOLTOOID");
  const huiswerk = laatsteGereden?.huiswerk ?? [];

  async function actie(body: Record<string, unknown>, melding: string) {
    setFout(null);
    setOk(null);
    try {
      setD(await stuur<LeerlingWeergave>(api, "POST", body));
      setOk(melding);
    } catch (e) {
      setFout(foutVan(e));
      if (/log opnieuw in/i.test(foutVan(e))) router.replace(`/rijschool/${slug}/inloggen`);
    }
  }

  // iDEAL: naar de betaalpagina van Stripe; het tegoed komt erbij zodra Stripe de betaling meldt
  const [betaalt, setBetaalt] = useState<string | null>(null);
  async function betaal(wat: { productId: string } | { betalingId: string }) {
    setFout(null);
    setOk(null);
    setBetaalt("productId" in wat ? wat.productId : wat.betalingId);
    try {
      const { url } = await stuur<{ url: string }>(api, "POST", { actie: "betaal", ...wat });
      window.location.assign(url);
    } catch (e) {
      setFout(foutVan(e));
      setBetaalt(null);
    }
  }

  // terug van de betaalpagina: melden, en het tegoed nog even verversen (de bevestiging van Stripe kan een paar seconden duren)
  useEffect(() => {
    const uitslag = new URLSearchParams(window.location.search).get("betaling");
    if (!uitslag) return;
    window.history.replaceState(null, "", window.location.pathname);
    setTab("tegoed");
    if (uitslag === "geannuleerd") return setFout("De betaling is niet afgerond. Er is niets afgeschreven.");
    setOk("Bedankt! Je betaling is gelukt. Je tegoed wordt bijgewerkt.");
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const bij = await stuur<LeerlingWeergave>(api).catch(() => null);
      if (bij) setD(bij);
      if (n >= 4) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [api]);

  async function uitloggen() {
    await stuur(`/api/rijschool/site/${slug}/account`, "POST", { actie: "uitloggen" }).catch(() => undefined);
    router.replace(`/rijschool/${slug}/inloggen`);
    router.refresh();
  }

  function naarUitleg(sleutel: string) {
    setUitlegOpen(sleutel);
    setTab("oefenen");
  }

  return (
    <div>
      <div className="mb-4 space-y-2">
        <Melding fout={fout} ok={ok} />
      </div>

      {tab === "overzicht" && (
        <div className="space-y-4">
          <h1 className="font-display text-2xl font-bold">Hoi {d.leerling.naam.split(" ")[0]}</h1>
          <section className="rounded-2xl p-5 text-white" style={{ background: kleur }}>
            <p className="text-sm text-white/80">Volgende les</p>
            {volgende ? (
              <>
                <p className="mt-1 text-xl font-bold">{metHoofdletter(datumLang(volgende.start))}</p>
                <p className="num text-lg">
                  {tijd(volgende.start)} – {tijd(volgende.eind)} · {SOORT_LABEL[volgende.soort]}
                </p>
                <p className="mt-2 text-sm text-white/85">
                  Met {volgende.instructeurNaam}
                  {volgende.ophaaladres ? ` · ophalen: ${volgende.ophaaladres}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold">Er staat nog geen les gepland.</p>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setTab("voortgang")} className="rounded-2xl border border-hair bg-white p-4 text-left">
              <p className="text-xs text-neutralx-500">Voortgang</p>
              <p className="num font-display text-2xl font-bold">{d.voortgang.procent}%</p>
              <Voortgangsbalk procent={d.voortgang.procent} kleur={kleur} label="Voortgang" />
            </button>
            <button type="button" onClick={() => setTab("tegoed")} className="rounded-2xl border border-hair bg-white p-4 text-left">
              <p className="text-xs text-neutralx-500">Tegoed</p>
              <p className={`font-display text-lg font-bold ${d.saldoMin < 0 ? "text-crit" : ""}`}>{tegoedTekst(d.saldoMin, d.rijschool.lesMinuten)}</p>
            </button>
          </div>
          {laatsteGereden && (laatsteGereden.verslag || huiswerk.length > 0) && (
            <section className="rounded-2xl border border-hair bg-white p-5">
              <p className="text-xs text-neutralx-500">Laatste les · {datumKort(laatsteGereden.start)}</p>
              {laatsteGereden.verslag && <p className="mt-1 whitespace-pre-line text-sm">{laatsteGereden.verslag}</p>}
              {huiswerk.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold">Huiswerk voor de volgende les</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {huiswerk.map((h) => (
                      <li key={h}>
                        <button type="button" onClick={() => naarUitleg(h)} className="rounded-full bg-paper-soft px-3 py-1.5 text-sm font-medium ring-1 ring-hair">
                          {onderdeelVan(h)?.onderdeel.titel ?? h}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          {d.leerling.examenDatum && (
            <section className="rounded-2xl border border-hair bg-white p-5">
              <p className="text-xs text-neutralx-500">Praktijkexamen</p>
              <p className="font-semibold">{metHoofdletter(datumLang(`${d.leerling.examenDatum}T12:00:00Z`))}</p>
            </section>
          )}
          <Profiel d={d} onBewaar={(telefoon, adres) => actie({ actie: "profiel", telefoon, adres }, "Je gegevens zijn opgeslagen.")} onUitloggen={uitloggen} />
        </div>
      )}

      {tab === "lessen" && (
        <div className="space-y-5">
          {d.rijschool.zelfPlannen && d.instructeur && <ZelfPlannen api={api} instructeurId={d.instructeur.id} kleur={kleur} onPlan={(start) => actie({ actie: "plan", instructeurId: d.instructeur?.id, start }, "Je les is ingepland. Je krijgt een bevestiging per mail.")} />}
          <section>
            <h2 className="font-semibold">Gepland</h2>
            {komend.length === 0 ? (
              <p className="mt-1 text-sm text-neutralx-600">Geen geplande lessen.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {komend.map((l) => (
                  <LesRegel key={l.id} les={l}>
                    {new Date(l.start).getTime() - nu > d.rijschool.annuleerUren * 3_600_000 ? (
                      <button
                        type="button"
                        className="mt-2 text-sm font-semibold text-crit underline underline-offset-2"
                        onClick={() => window.confirm("Deze les annuleren?") && actie({ actie: "annuleer", lesId: l.id }, "De les is geannuleerd.")}
                      >
                        Annuleren
                      </button>
                    ) : (
                      <p className="mt-2 text-xs text-neutralx-500">Annuleren kan nu alleen nog via je rijschool{d.rijschool.telefoon ? ` (${d.rijschool.telefoon})` : ""}.</p>
                    )}
                  </LesRegel>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="font-semibold">Eerder</h2>
            {geweest.length === 0 ? (
              <p className="mt-1 text-sm text-neutralx-600">Nog geen lessen.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {geweest.map((l) => (
                  <LesRegel key={l.id} les={l}>
                    {l.verslag && <p className="mt-2 whitespace-pre-line text-sm text-neutralx-700">{l.verslag}</p>}
                    {l.route && <Lesroute route={l.route} kleur={kleur} />}
                  </LesRegel>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "voortgang" && <Leskaart voortgang={d.voortgang} kleur={kleur} onUitleg={naarUitleg} />}

      {tab === "oefenen" && <OefenTab d={d} huiswerk={huiswerk} uitlegOpen={uitlegOpen} setUitlegOpen={setUitlegOpen} onRonde={(onderdeel, goed, totaal) => void actie({ actie: "theorie", onderdeel, goed, totaal }, `Ronde bewaard: ${goed} van ${totaal} goed.`)} />}

      {tab === "tegoed" && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-hair bg-white p-5">
            <p className="text-sm text-neutralx-600">Je tegoed</p>
            <p className={`font-display text-3xl font-bold ${d.saldoMin < 0 ? "text-crit" : ""}`}>{tegoedTekst(d.saldoMin, d.rijschool.lesMinuten)}</p>
            <p className="mt-1 text-xs text-neutralx-500">Een gereden les gaat van je tegoed af. Proeflessen en examens betaal je los.</p>
          </section>
          {d.onlineBetalen && d.betalingen.some((b) => b.status === "OPEN") && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="font-semibold text-amber-900">Nog te betalen</h2>
              <ul className="mt-2 space-y-2">
                {d.betalingen
                  .filter((b) => b.status === "OPEN")
                  .map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm">
                        {b.omschrijving} · <span className="num font-semibold">{euro(b.bedragCent)}</span>
                      </span>
                      <button type="button" className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: kleur }} disabled={!!betaalt} onClick={() => void betaal({ betalingId: b.id })}>
                        {betaalt === b.id ? "Even geduld…" : "Betaal nu met iDEAL"}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {d.producten.length > 0 && (
            <section>
              <h2 className="font-semibold">Pakketten</h2>
              <ul className="mt-2 space-y-2">
                {d.producten.map((p) => (
                  <li key={p.id} className="rounded-xl border border-hair bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        <span className="block font-semibold">{p.naam}</span>
                        <span className="block text-xs text-neutralx-500">{p.omschrijving}</span>
                      </span>
                      <span className="num font-semibold">{euro(p.prijsCent)}</span>
                    </div>
                    {d.onlineBetalen && p.prijsCent >= 100 && (
                      <button type="button" className="mt-3 w-full rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: kleur }} disabled={!!betaalt} onClick={() => void betaal({ productId: p.id })}>
                        {betaalt === p.id ? "Even geduld…" : "Koop met iDEAL"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-neutralx-500">
                {d.onlineBetalen
                  ? "Na betaling staan de lessen meteen op je tegoed. Je kunt ook bij je instructeur pinnen."
                  : "Een pakket kopen? Betaal bij je instructeur met pin of vraag je rijschool om een betaalverzoek."}
              </p>
            </section>
          )}
          <section>
            <h2 className="font-semibold">Betalingen</h2>
            {d.betalingen.length === 0 ? (
              <p className="mt-1 text-sm text-neutralx-600">Nog geen betalingen.</p>
            ) : (
              <ul className="mt-2 divide-y divide-hair rounded-xl border border-hair bg-white">
                {d.betalingen.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span>
                      <span className="block font-medium">{b.omschrijving}</span>
                      <span className="block text-xs text-neutralx-500">
                        {datumKort(b.betaaldOm ?? b.aangemaakt)}
                        {b.methode ? ` · ${METHODE_LABEL[b.methode]}` : ""}
                        {b.status !== "BETAALD" ? ` · ${b.status.toLowerCase()}` : ""}
                      </span>
                    </span>
                    <span className="num font-semibold">{euro(b.bedragCent)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <nav aria-label="App-menu" className="fixed inset-x-0 bottom-0 z-30 border-t border-hair bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[0.7rem] font-semibold ${tab === t.id ? "" : "text-neutralx-500"}`}
              style={tab === t.id ? { color: kleur } : undefined}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d={t.icoon} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function LesRegel({ les, children }: { les: LeerlingLes; children?: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-hair bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{metHoofdletter(datumLang(les.start))}</p>
          <p className="num text-sm text-neutralx-600">
            {tijd(les.start)} – {tijd(les.eind)} · {SOORT_LABEL[les.soort]} · {les.instructeurNaam}
          </p>
        </div>
        <LesStatus status={les.status} />
      </div>
      {children}
    </li>
  );
}

function OefenTab({
  d,
  huiswerk,
  uitlegOpen,
  setUitlegOpen,
  onRonde,
}: {
  d: LeerlingWeergave;
  huiswerk: string[];
  uitlegOpen: string | null;
  setUitlegOpen: (s: string | null) => void;
  onRonde: (onderdeel: string, goed: number, totaal: number) => void;
}) {
  const [soort, setSoort] = useState<"voorbereiding" | "theorie">(uitlegOpen ? "voorbereiding" : huiswerk.length > 0 ? "voorbereiding" : "theorie");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Oefenen" className="grid grid-cols-2 gap-1 rounded-full bg-paper-soft p-1">
        {(
          [
            ["voorbereiding", "Lesvoorbereiding"],
            ["theorie", "Theorie"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={soort === id} onClick={() => setSoort(id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${soort === id ? "bg-white shadow-sm" : "text-neutralx-600"}`}>
            {label}
          </button>
        ))}
      </div>
      {soort === "voorbereiding" ? (
        <Lesvoorbereiding huiswerk={huiswerk} open={uitlegOpen} onOpen={setUitlegOpen} kleur={d.rijschool.kleur} />
      ) : (
        <TheorieOefenen scores={d.theorie} kleur={d.rijschool.kleur} onKlaar={onRonde} />
      )}
    </div>
  );
}

function ZelfPlannen({ api, instructeurId, kleur, onPlan }: { api: string; instructeurId: string; kleur: string; onPlan: (start: string) => void | Promise<void> }) {
  const dagen = komendeDagen(new Date(), 28).slice(1);
  const [datum, setDatum] = useState<string | null>(null);
  const [tijden, setTijden] = useState<string[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function kies(d: string) {
    setDatum(d);
    setTijden(null);
    setFout(null);
    try {
      const r = await stuur<{ instructeurId: string; tijden: string[] }>(`${api}?vrij=${d}`);
      setTijden(r.instructeurId === instructeurId ? r.tijden : []);
    } catch (e) {
      setFout(foutVan(e));
    }
  }

  return (
    <section className="rounded-2xl border border-hair bg-white p-5">
      <h2 className="font-semibold">Zelf een les plannen</h2>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2">
        {dagen.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => kies(d)}
            aria-pressed={datum === d}
            className={`min-w-[5rem] rounded-xl border px-3 py-2 text-sm font-semibold ${datum === d ? "border-transparent text-white" : "border-hair bg-white"}`}
            style={datum === d ? { background: kleur } : undefined}
          >
            {metHoofdletter(datumKort(`${d}T12:00:00Z`))}
          </button>
        ))}
      </div>
      <Melding fout={fout} />
      {datum && tijden === null && !fout && <p className="text-sm text-neutralx-500">Vrije tijden zoeken…</p>}
      {tijden && tijden.length === 0 && <p className="text-sm text-neutralx-600">Op deze dag is niets vrij.</p>}
      {tijden && tijden.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tijden.map((t) => (
            <button
              key={t}
              type="button"
              className="num rounded-lg border border-hair px-3 py-2 text-sm font-semibold hover:border-neutralx-300"
              onClick={() => window.confirm(`Les plannen op ${datumLang(t)} om ${tijd(t)}?`) && void onPlan(t)}
            >
              {tijd(t)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Profiel({ d, onBewaar, onUitloggen }: { d: LeerlingWeergave; onBewaar: (telefoon: string, adres: string) => void | Promise<void>; onUitloggen: () => void }) {
  const [open, setOpen] = useState(false);
  const [telefoon, setTelefoon] = useState(d.leerling.telefoon);
  const [adres, setAdres] = useState(d.leerling.adres);
  return (
    <section className="rounded-2xl border border-hair bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{d.leerling.naam}</p>
          <p className="truncate text-xs text-neutralx-500">{d.leerling.email}</p>
        </div>
        <button type="button" className="text-sm font-semibold underline underline-offset-2" onClick={() => setOpen(!open)}>
          {open ? "Sluiten" : "Gegevens"}
        </button>
      </div>
      {open && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onBewaar(telefoon, adres);
          }}
        >
          <Veld label="Telefoon">
            <input className="field-input" type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} maxLength={30} />
          </Veld>
          <Veld label="Ophaaladres">
            <input className="field-input" value={adres} onChange={(e) => setAdres(e.target.value)} maxLength={160} />
          </Veld>
          {d.instructeur && (
            <p className="text-sm text-neutralx-600">
              Je instructeur: <strong>{d.instructeur.naam}</strong>
              {d.instructeur.telefoon ? ` · ${d.instructeur.telefoon}` : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-full px-5 py-2.5 text-sm font-semibold text-white" style={{ background: d.rijschool.kleur }}>
              Opslaan
            </button>
            <button type="button" className="rounded-full border border-hair px-5 py-2.5 text-sm font-semibold" onClick={onUitloggen}>
              Uitloggen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// De kaart komt pas als je hem openklapt (eigen bundel met de kaartmotor).
const RouteKaart = dynamic(() => import("@/components/kaart/RouteKaart"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-paper-soft" /> });

/** De gereden route van een les (lib/rijschool/lesroute.ts), opgenomen door je instructeur. */
function Lesroute({ route, kleur }: { route: RouteWeergave; kleur: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button type="button" aria-expanded={open} className="text-sm font-semibold underline underline-offset-2" onClick={() => setOpen(!open)}>
        {open ? "Lesroute verbergen" : `Bekijk je lesroute (${afstandTekst(route.meters)}, ${duurTekst(route.seconden)})`}
      </button>
      {open && <RouteKaart punten={route.punten} kleur={kleur} className="mt-2 h-64 rounded-xl ring-1 ring-hair" />}
    </div>
  );
}
