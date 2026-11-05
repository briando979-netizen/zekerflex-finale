"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { BUNDEL_TLDS, euroPrijs, metBtw } from "@/lib/domeinen/extensies";

type Status = "vrij" | "bezet" | "waarschijnlijk-vrij" | "onbekend";
interface Resultaat {
  domein: string;
  tld: string;
  /** eerste jaar, excl. btw */
  prijsCent: number | null;
  /** daarna per jaar, excl. btw */
  verlengCent: number | null;
  status: Status;
}
type Soort = "registreren" | "verhuizen";

const VELD = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-base text-ink";
/** in een smal paneel eerst alleen de getypte en de populaire extensies */
const SMAL_AANTAL = 5;
const fout = async (r: Response | null, standaard: string) => {
  const d = r ? ((await r.json().catch(() => ({}))) as { error?: { message?: string } }) : {};
  return d.error?.message ?? standaard;
};

const LABEL: Record<Status, { tekst: string; klasse: string }> = {
  vrij: { tekst: "Vrij", klasse: "bg-mintwash text-brand-700" },
  "waarschijnlijk-vrij": { tekst: "Waarschijnlijk vrij", klasse: "bg-mintwash text-brand-700" },
  bezet: { tekst: "Bezet", klasse: "bg-neutralx-100 text-neutralx-700" },
  onbekend: { tekst: "Even niet te controleren", klasse: "bg-neutralx-100 text-neutralx-700" },
};

type BestelStatus = "OPEN" | "BETAALD" | "GEREGISTREERD" | "MISLUKT" | "GEANNULEERD" | "OPGEZEGD";
interface MijnDomein {
  id: string;
  domein: string;
  status: BestelStatus;
  bedragCent: number;
  bundel: boolean;
  /** staat op de website van dit bedrijf */
  opWebsite?: boolean;
  /** tot wanneer de naam loopt (lib/domeinen/verlengen.ts) */
  verlooptOp?: string | null;
  autoVerlengen?: boolean;
  /** een verlengfactuur die nog betaald moet worden */
  open?: { nummer: string; bedragCent: number; betaalUrl: string; uiterlijk: string | null; incassoLoopt: boolean } | null;
  /** verhuizen en blijven (lib/domeinen/behoud.ts) */
  behoud?: { stap: "aanbod" | "gebleven" | "code-wacht" | "code-verstuurd" | "vertrokken" | null; aanbod: Aanbod | null } | null;
}
/** het blijfaanbod, incl. btw */
interface Aanbod {
  normaal: string;
  aanbod: string;
}
const VERHUIS_REDENEN: { waarde: string; label: string }[] = [
  { waarde: "te-duur", label: "Te duur" },
  { waarde: "andere-partij", label: "Ik ga met mijn website naar een andere partij" },
  { waarde: "niet-meer-nodig", label: "Ik heb de naam niet meer nodig" },
  { waarde: "anders", label: "Iets anders" },
];
const post = (body: unknown) => fetch("/api/werkgever/domeinen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
const BESTEL_LABEL: Record<BestelStatus, string> = {
  OPEN: "Wacht op betaling",
  BETAALD: "Betaald, we leggen hem nu vast",
  GEREGISTREERD: "Vastgelegd",
  MISLUKT: "Lukte niet, we nemen contact op",
  GEANNULEERD: "Geannuleerd",
  OPGEZEGD: "Opgezegd",
};
// datums pas na het laden in de browser (de lijst komt via fetch), altijd in Nederlandse tijd
const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

// Zoek een domeinnaam, zie per extensie of hij vrij is en wat hij kost, en
// vraag hem aan (of verhuis je eigen domein). Een ingelogd bedrijf bestelt en
// betaalt meteen (/api/werkgever/domeinen) en ziet zijn domeinen. Losse
// formulieren, nooit genest. Leest /api/domeinen/zoek, post naar /api/domeinen/aanvraag.
export function DomeinZoeker({
  startNaam = "",
  terugNaar = "/domeinnaam",
  smal = false,
  onGekoppeld,
}: {
  startNaam?: string;
  /** waar je na de betaalpagina terugkomt (lib/domeinen/bestelling.ts TERUG_PADEN) */
  terugNaar?: string;
  /** in een smal paneel (zoals de websitebouwer): velden onder elkaar */
  smal?: boolean;
  /** na "Koppel aan mijn website" (de bouwer ververst dan zijn tab Domein) */
  onGekoppeld?: (() => void) | undefined;
}) {
  const rij = smal ? "" : "sm:flex-row";
  const id = useId();
  const [zoek, setZoek] = useState(startNaam);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [res, setRes] = useState<Resultaat[] | null>(null);
  const [keuze, setKeuze] = useState<{ domein: string; soort: Soort; prijsCent: number | null; verlengCent: number | null } | null>(null);
  const [verhuis, setVerhuis] = useState("");
  const [werkgever, setWerkgever] = useState(false);
  const [mijn, setMijn] = useState<MijnDomein[] | null>(null);
  // eerste jaar nog inbegrepen (betaald websiteabonnement, bundel nog niet gebruikt)
  const [bundelOver, setBundelOver] = useState(false);
  const [terug, setTerug] = useState<{ gelukt: boolean; domein: string } | null>(null);
  const [alles, setAlles] = useState(false);

  const laadMijn = useCallback(async () => {
    const r = await fetch("/api/werkgever/domeinen", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { bestellingen: MijnDomein[]; bundel?: boolean };
    setMijn(d.bestellingen);
    setBundelOver(Boolean(d.bundel));
  }, []);
  useEffect(() => {
    // terug van de betaalpagina van Stripe
    const q = new URLSearchParams(window.location.search);
    const b = q.get("bestelling");
    if (b === "gelukt" || b === "geannuleerd") setTerug({ gelukt: b === "gelukt", domein: q.get("domein") ?? "" });
    // mag deze bezoeker als bedrijf meteen bestellen? (altijd 200, alleen ja/nee)
    void fetch("/api/auth/werkgever", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ werkgever?: boolean }>) : null))
      .then((d) => {
        if (d?.werkgever) {
          setWerkgever(true);
          void laadMijn();
        }
      })
      .catch(() => undefined);
  }, [laadMijn]);

  async function zoeken(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setMelding(null);
    setKeuze(null);
    setAlles(false);
    const r = await fetch(`/api/domeinen/zoek?naam=${encodeURIComponent(zoek)}`, { cache: "no-store" }).catch(() => null);
    setBezig(false);
    if (!r?.ok) {
      setRes(null);
      setMelding(await fout(r, "Zoeken lukte niet. Probeer het nog eens."));
      return;
    }
    setRes(((await r.json()) as { resultaten: Resultaat[] }).resultaten);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void zoeken(e)} role="search" aria-label="Domeinnaam zoeken" className={`flex flex-col gap-3 ${rij}`}>
        <label htmlFor={`${id}-zoek`} className="sr-only">
          Welke domeinnaam wil je?
        </label>
        <input
          id={`${id}-zoek`}
          className={`${VELD} sm:flex-1`}
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Bijvoorbeeld bakkerijjansen of bakkerijjansen.nl"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={120}
        />
        <button type="submit" disabled={bezig} className="btn-primary justify-center px-6 py-2.5 disabled:opacity-60">
          {bezig ? "Zoeken…" : "Zoek domeinnaam"}
        </button>
      </form>
      {melding && (
        <p role="alert" className="rounded-xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {melding}
        </p>
      )}

      {res && (
        <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-white" aria-label="Zoekresultaten">
          {(smal && !alles ? res.slice(0, SMAL_AANTAL) : res).map((r) => {
            const kan = r.status === "vrij" || r.status === "waarschijnlijk-vrij" || r.status === "onbekend";
            const naam = <span className={`${smal ? "block" : "min-w-0 flex-1"} break-all font-display text-lg font-bold text-ink`}>{r.domein}</span>;
            const rest = (
              <>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LABEL[r.status].klasse}`}>{LABEL[r.status].tekst}</span>
                {r.prijsCent !== null && (
                  <span className="text-sm text-neutralx-700">
                    {r.verlengCent !== null && r.verlengCent !== r.prijsCent ? `${euroPrijs(r.prijsCent)} eerste jaar, daarna ${euroPrijs(r.verlengCent)}` : `${euroPrijs(r.prijsCent)} per jaar`}
                  </span>
                )}
                {kan ? (
                  <button
                    type="button"
                    aria-label={`Kies ${r.domein}`}
                    className={`btn-primary px-4 py-1.5 text-sm ${smal ? "ml-auto" : ""}`}
                    onClick={() => setKeuze({ domein: r.domein, soort: "registreren", prijsCent: r.prijsCent, verlengCent: r.verlengCent })}
                  >
                    {smal ? "Kies" : `Kies ${r.domein}`}
                  </button>
                ) : (
                  <button type="button" className="btn-ghost px-4 py-1.5 text-sm" onClick={() => setKeuze({ domein: r.domein, soort: "verhuizen", prijsCent: r.prijsCent, verlengCent: r.verlengCent })}>
                    {smal ? "Verhuizen" : "Is hij van jou? Verhuizen"}
                  </button>
                )}
              </>
            );
            return smal ? (
              // smal paneel: de naam op een eigen regel, daaronder stand, prijs en knop
              <li key={r.domein} className="space-y-2 px-3 py-3">
                {naam}
                <div className="flex flex-wrap items-center gap-2">{rest}</div>
              </li>
            ) : (
              <li key={r.domein} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                {naam}
                {rest}
              </li>
            );
          })}
        </ul>
      )}
      {res && smal && !alles && res.length > SMAL_AANTAL && (
        <button type="button" onClick={() => setAlles(true)} className="text-sm font-semibold text-brand-600 underline">
          Toon alle extensies ({res.length})
        </button>
      )}
      {res && <p className="text-xs text-neutralx-500">Prijzen per jaar, excl. btw. Bij het aanvragen controleren we de beschikbaarheid nog een keer.</p>}

      {!keuze && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (verhuis.trim()) setKeuze({ domein: verhuis.trim(), soort: "verhuizen", prijsCent: null, verlengCent: null });
          }}
          aria-label="Domein verhuizen"
          className="rounded-2xl border border-hair bg-paper-soft p-4"
        >
          <label htmlFor={`${id}-verhuis`} className="block text-sm font-semibold text-ink">
            Heb je al een domeinnaam? Verhuis hem naar ZekerFlex
          </label>
          <div className={`mt-2 flex flex-col gap-3 ${rij}`}>
            <input id={`${id}-verhuis`} className={`${VELD} sm:flex-1`} value={verhuis} onChange={(e) => setVerhuis(e.target.value)} placeholder="jouwbedrijf.nl" spellCheck={false} maxLength={120} />
            <button type="submit" className="btn-ghost justify-center px-5 py-2.5">
              Verhuizen
            </button>
          </div>
        </form>
      )}

      {keuze &&
        (werkgever && keuze.soort === "registreren" && keuze.prijsCent !== null ? (
          <Bestellen
            key={keuze.domein}
            domein={keuze.domein}
            prijsCent={keuze.prijsCent}
            verlengCent={keuze.verlengCent ?? keuze.prijsCent}
            inbegrepen={bundelOver && (BUNDEL_TLDS as readonly string[]).includes(keuze.domein.slice(keuze.domein.indexOf(".") + 1))}
            terugNaar={terugNaar}
            onAnnuleer={() => setKeuze(null)}
            onKlaar={() => void laadMijn()}
          />
        ) : (
          <Aanvraag key={`${keuze.domein}-${keuze.soort}`} domein={keuze.domein} soort={keuze.soort} smal={smal} onAnnuleer={() => setKeuze(null)} />
        ))}
      {keuze && !werkgever && keuze.soort === "registreren" && (
        <p className="text-sm text-neutralx-600">
          Heb je een bedrijfsaccount bij ZekerFlex?{" "}
          <Link href="/login?callbackUrl=%2Fdomeinnaam" className="font-semibold text-brand-600 underline">
            Log in
          </Link>{" "}
          om direct te bestellen en te betalen.
        </p>
      )}

      {terug && (
        <p role="status" className={`rounded-2xl p-4 ${terug.gelukt ? "border border-brand-500/30 bg-mintwash text-ink" : "bg-neutralx-100 text-neutralx-700"}`}>
          {terug.gelukt
            ? `Betaling gelukt! We leggen ${terug.domein || "je domeinnaam"} nu voor je vast en mailen je zodra hij klaar is, meestal binnen een paar minuten. De factuur staat bij Facturen.`
            : `Je hebt het betalen afgebroken. ${terug.domein || "De domeinnaam"} is nog niet besteld; je kunt het gewoon opnieuw proberen.`}
        </p>
      )}

      {werkgever && mijn && mijn.length > 0 && <MijnDomeinen lijst={mijn} onLijst={setMijn} onGekoppeld={onGekoppeld} />}
    </div>
  );
}

function MijnDomeinen({ lijst, onLijst, onGekoppeld }: { lijst: MijnDomein[]; onLijst: (l: MijnDomein[]) => void; onGekoppeld?: (() => void) | undefined }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  // welke naam het verhuispaneel open heeft, en het blijfaanbod na "verlengen uit"
  const [verhuisOpen, setVerhuisOpen] = useState<string | null>(null);
  const [aanbodNaUit, setAanbodNaUit] = useState<{ id: string; domein: string; aanbod: Aanbod } | null>(null);

  // automatisch verlengen aan of uit; daarna de serverversie van de lijst (een open factuur kan vervallen)
  async function verlengen(d: MijnDomein, aan: boolean) {
    setBezig(d.id);
    setMelding(null);
    const r = await fetch("/api/werkgever/domeinen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verlengen: d.id, aan }) }).catch(() => null);
    setBezig(null);
    if (!r?.ok) return setMelding({ ok: false, tekst: await fout(r, "Opslaan lukte niet. Probeer het opnieuw.") });
    const data = (await r.json()) as { bestellingen: MijnDomein[]; aanbod?: Aanbod | null };
    onLijst(data.bestellingen);
    setAanbodNaUit(!aan && data.aanbod ? { id: d.id, domein: d.domein, aanbod: data.aanbod } : null);
    setMelding({
      ok: true,
      tekst: aan
        ? `${d.domein} wordt elk jaar verlengd. Je krijgt de factuur ruim vooraf.`
        : `${d.domein} wordt niet verlengd. Hij werkt tot ${d.verlooptOp ? datum(d.verlooptOp) : "de verlengdatum"} en wordt een week daarvoor opgezegd. Je kunt dit tot die tijd terugdraaien.`,
    });
  }

  // een vastgelegde naam op de eigen website zetten; daarna de serverversie van de lijst
  async function koppel(d: MijnDomein) {
    setBezig(d.id);
    setMelding(null);
    const r = await fetch("/api/werkgever/domeinen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ koppel: d.id }) }).catch(() => null);
    setBezig(null);
    if (!r?.ok) return setMelding({ ok: false, tekst: await fout(r, "Koppelen lukte niet. Probeer het opnieuw.") });
    onLijst(((await r.json()) as { bestellingen: MijnDomein[] }).bestellingen);
    setMelding({ ok: true, tekst: `${d.domein} staat nu op je website. Zodra de DNS overal is bijgewerkt (meestal binnen een paar uur), werkt het adres.` });
    onGekoppeld?.();
  }

  return (
    <section aria-labelledby="mijn-domeinen" className="rounded-2xl border border-hair bg-white p-5">
      <h3 id="mijn-domeinen" className="font-display text-lg font-bold text-ink">
        Jouw domeinnamen
      </h3>
      <ul className="mt-3 divide-y divide-hair text-sm">
        {lijst.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="break-all font-semibold text-ink">{d.domein}</span>
            <span className="flex flex-wrap items-center gap-2 text-neutralx-600">
              <span>
                {BESTEL_LABEL[d.status]}
                {d.status === "GEREGISTREERD" && d.opWebsite ? " · op je website" : ""}
                {d.bundel ? " · in de bundel" : ""}
                {d.verlooptOp ? ` · ${d.status === "OPGEZEGD" ? "werkt tot" : "loopt tot"} ${datum(d.verlooptOp)}` : ""}
              </span>
              {d.open &&
                (d.open.incassoLoopt ? (
                  <span className="text-xs">Verlenging ({euroPrijs(d.open.bedragCent)}) wordt afgeschreven</span>
                ) : (
                  <a href={d.open.betaalUrl} className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">
                    Betaal verlenging ({euroPrijs(d.open.bedragCent)})
                  </a>
                ))}
              {d.status === "GEREGISTREERD" && typeof d.autoVerlengen === "boolean" && (
                <button
                  type="button"
                  disabled={bezig !== null}
                  aria-pressed={d.autoVerlengen}
                  onClick={() => void verlengen(d, !d.autoVerlengen)}
                  aria-label={`Automatisch verlengen van ${d.domein}`}
                  className="rounded-full border border-hair px-3 py-1 text-xs font-semibold text-ink hover:bg-neutralx-100 disabled:opacity-50"
                >
                  {bezig === d.id ? "Bezig…" : d.autoVerlengen ? "Automatisch verlengen: aan" : "Automatisch verlengen: uit"}
                </button>
              )}
              {d.status === "GEREGISTREERD" && !d.opWebsite && (
                <button
                  type="button"
                  disabled={bezig !== null}
                  onClick={() => void koppel(d)}
                  aria-label={`Koppel ${d.domein} aan mijn website`}
                  className="rounded-full border border-brand-600 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-mintwash disabled:opacity-50"
                >
                  {bezig === d.id ? "Bezig…" : "Koppel aan mijn website"}
                </button>
              )}
              {d.status === "GEREGISTREERD" && d.behoud?.stap !== "code-wacht" && d.behoud?.stap !== "code-verstuurd" && (
                <button
                  type="button"
                  aria-expanded={verhuisOpen === d.id}
                  onClick={() => {
                    setMelding(null);
                    setVerhuisOpen((o) => (o === d.id ? null : d.id));
                  }}
                  aria-label={`${d.domein} verhuizen naar een andere partij`}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-neutralx-600 underline hover:text-ink"
                >
                  Verhuizen naar elders
                </button>
              )}
              {d.behoud?.stap === "code-wacht" && <span className="text-xs">Je verhuiscode komt binnen een dag per mail</span>}
              {d.behoud?.stap === "code-verstuurd" && <span className="text-xs">Verhuiscode verstuurd</span>}
            </span>
            {verhuisOpen === d.id && (
              <Verhuispaneel
                d={d}
                onLijst={(l) => {
                  onLijst(l);
                }}
                onKlaar={(tekst) => {
                  setVerhuisOpen(null);
                  setMelding({ ok: true, tekst });
                }}
              />
            )}
          </li>
        ))}
      </ul>
      {aanbodNaUit && (
        <BlijfAanbod
          id={aanbodNaUit.id}
          domein={aanbodNaUit.domein}
          aanbod={aanbodNaUit.aanbod}
          onLijst={onLijst}
          onKlaar={(tekst) => {
            setAanbodNaUit(null);
            setMelding({ ok: true, tekst });
          }}
        />
      )}
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-3 text-sm ${melding.ok ? "text-ok" : "text-crit"}`}>
          {melding.tekst}
        </p>
      )}
    </section>
  );
}

/** Het blijfaanbod na "verlengen uit": volgend jaar goedkoper. */
function BlijfAanbod({ id, domein, aanbod, onLijst, onKlaar }: { id: string; domein: string; aanbod: Aanbod; onLijst: (l: MijnDomein[]) => void; onKlaar: (tekst: string) => void }) {
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  async function ja() {
    setBezig(true);
    const r = await post({ blijf: id });
    setBezig(false);
    if (!r?.ok) return setMelding(await fout(r, "Dat lukte niet. Probeer het opnieuw."));
    onLijst(((await r.json()) as { bestellingen: MijnDomein[] }).bestellingen);
    onKlaar(`Fijn dat je blijft! ${domein} wordt verlengd voor ${aanbod.aanbod} in plaats van ${aanbod.normaal}.`);
  }
  return (
    <div className="mt-3 rounded-xl border border-brand-500/30 bg-mintwash p-4 text-sm text-ink">
      <p>
        <strong>Blijf je toch?</strong> Houd {domein} en betaal volgend jaar {aanbod.aanbod} in plaats van {aanbod.normaal} (incl. btw).
      </p>
      {melding && (
        <p role="alert" className="mt-2 font-semibold text-crit">
          {melding}
        </p>
      )}
      <button type="button" disabled={bezig} onClick={() => void ja()} className="btn-primary mt-3 px-4 py-1.5 text-sm disabled:opacity-60">
        {bezig ? "Bezig…" : "Ja, ik blijf"}
      </button>
    </div>
  );
}

/** Verhuizen gaat via ZekerFlex: reden kiezen, het blijfaanbod zien, dan pas de verhuiscode. */
function Verhuispaneel({ d, onLijst, onKlaar }: { d: MijnDomein; onLijst: (l: MijnDomein[]) => void; onKlaar: (tekst: string) => void }) {
  const id = useId();
  const [reden, setReden] = useState("");
  const [aanbod, setAanbod] = useState<Aanbod | null | undefined>(undefined);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  async function verder(e: FormEvent) {
    e.preventDefault();
    if (!reden) return setMelding("Kies waarom je wilt verhuizen.");
    setBezig(true);
    setMelding(null);
    const r = await post({ verhuis: d.id, reden });
    setBezig(false);
    if (!r?.ok) return setMelding(await fout(r, "Dat lukte niet. Probeer het opnieuw."));
    const data = (await r.json()) as { bestellingen: MijnDomein[]; aanbod: Aanbod | null };
    onLijst(data.bestellingen);
    setAanbod(data.aanbod);
  }
  async function kies(body: unknown, tekst: string) {
    setBezig(true);
    setMelding(null);
    const r = await post(body);
    setBezig(false);
    if (!r?.ok) return setMelding(await fout(r, "Dat lukte niet. Probeer het opnieuw."));
    onLijst(((await r.json()) as { bestellingen: MijnDomein[] }).bestellingen);
    onKlaar(tekst);
  }

  return (
    <div className="mt-2 w-full rounded-xl border border-hair bg-neutralx-50 p-4 text-sm text-ink">
      {aanbod === undefined ? (
        <form onSubmit={(e) => void verder(e)} className="grid gap-3">
          <label htmlFor={`${id}-reden`} className="font-semibold">
            Waarom wil je {d.domein} verhuizen?
          </label>
          <select id={`${id}-reden`} value={reden} onChange={(e) => setReden(e.target.value)} className={VELD}>
            <option value="">Kies een reden</option>
            {VERHUIS_REDENEN.map((r) => (
              <option key={r.waarde} value={r.waarde}>
                {r.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={bezig} className="btn-ghost justify-self-start px-4 py-1.5 text-sm disabled:opacity-60">
            {bezig ? "Bezig…" : "Verder"}
          </button>
        </form>
      ) : (
        <div className="grid gap-3">
          {aanbod ? (
            <p>
              <strong>Blijf bij ZekerFlex</strong> en betaal volgend jaar {aanbod.aanbod} in plaats van {aanbod.normaal} (incl. btw). Je website, mail en alles
              blijven gewoon werken.
            </p>
          ) : (
            <p>Jammer dat je wilt verhuizen. Kunnen we iets voor je doen? Antwoord op onze mail of bel ons.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={bezig} onClick={() => void kies({ blijf: d.id }, `Fijn dat je blijft! ${d.domein} blijft gewoon bij ZekerFlex.`)} className="btn-primary px-4 py-1.5 text-sm disabled:opacity-60">
              {aanbod ? "Ja, ik blijf" : "Ik blijf toch"}
            </button>
            <button
              type="button"
              disabled={bezig}
              onClick={() => void kies({ verhuisBevestig: d.id }, `Je verhuiscode voor ${d.domein} komt binnen een dag per mail.`)}
              className="btn-ghost px-4 py-1.5 text-sm disabled:opacity-60"
            >
              Nee, stuur mijn verhuiscode
            </button>
          </div>
        </div>
      )}
      {melding && (
        <p role="alert" className="mt-2 font-semibold text-crit">
          {melding}
        </p>
      )}
    </div>
  );
}

function Bestellen({
  domein,
  prijsCent,
  verlengCent,
  inbegrepen,
  terugNaar,
  onAnnuleer,
  onKlaar,
}: {
  domein: string;
  prijsCent: number;
  /** daarna per jaar, excl. btw */
  verlengCent: number;
  /** het eerste jaar is inbegrepen bij het (betaalde) websiteabonnement: vooraf laten zien, niet pas na de klik */
  inbegrepen: boolean;
  terugNaar: string;
  onAnnuleer: () => void;
  onKlaar: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [bundel, setBundel] = useState(false);
  const p = metBtw(prijsCent);
  const v = metBtw(verlengCent);

  async function bestel() {
    setBezig(true);
    setMelding(null);
    const r = await fetch("/api/werkgever/domeinen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domein, terug: terugNaar }) }).catch(() => null);
    if (!r?.ok) {
      setBezig(false);
      return setMelding(await fout(r, "Bestellen lukte niet. Probeer het opnieuw of mail sales@zekerflex.com."));
    }
    const d = (await r.json()) as { soort: "betalen"; url: string } | { soort: "bundel"; id: string };
    if (d.soort === "betalen") {
      window.location.href = d.url;
      return;
    }
    setBezig(false);
    setBundel(true);
    onKlaar();
  }

  if (bundel) {
    return (
      <p role="status" className="rounded-2xl border border-brand-500/30 bg-mintwash p-5 text-ink">
        <strong>{domein} is besteld!</strong> Het eerste jaar is inbegrepen bij je websiteabonnement. We leggen hem nu voor je vast en mailen je zodra hij
        klaar is, meestal binnen een paar minuten.
      </p>
    );
  }
  return (
    <section aria-label={`${domein} bestellen`} className="rounded-2xl border border-hair bg-white p-5">
      <h3 className="font-display text-xl font-bold text-ink">{domein} bestellen</h3>
      {inbegrepen ? (
        <>
          <dl className="mt-3 max-w-sm space-y-1 text-sm">
            <div className="flex justify-between gap-4 font-semibold">
              <dt className="text-ink">Eerste jaar</dt>
              <dd className="text-ink">{euroPrijs(0)} (inbegrepen)</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutralx-600">Daarna per jaar, incl. btw</dt>
              <dd className="text-ink">{euroPrijs(v.inclCent)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-neutralx-600">
            Het eerste jaar is inbegrepen bij je websiteabonnement; je betaalt nu niets. Daarna verlengt hij per jaar, opzeggen kan altijd voor de verlengdatum.
          </p>
        </>
      ) : (
        <>
          <dl className="mt-3 max-w-sm space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-neutralx-600">Domeinnaam, eerste jaar</dt>
              <dd className="text-ink">{euroPrijs(p.exclCent)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutralx-600">Btw 21%</dt>
              <dd className="text-ink">{euroPrijs(p.btwCent)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-hair pt-1 font-semibold">
              <dt className="text-ink">Totaal</dt>
              <dd className="text-ink">{euroPrijs(p.inclCent)}</dd>
            </div>
            <div className="flex justify-between gap-4 pt-1">
              <dt className="text-neutralx-600">Daarna per jaar, incl. btw</dt>
              <dd className="text-ink">{euroPrijs(v.inclCent)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-neutralx-600">
            Je betaalt met iDEAL of je kaart. Met een betaald websiteabonnement van ZekerFlex is je eerste .nl, .com, .eu of .be het eerste jaar inbegrepen. Daarna
            verlengt hij per jaar; je krijgt de factuur ruim vooraf en opzeggen kan altijd voor de verlengdatum.
          </p>
        </>
      )}
      {melding && (
        <p role="alert" className="mt-3 rounded-xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {melding}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={bezig} onClick={() => void bestel()} className="btn-primary px-5 py-2.5 disabled:opacity-60">
          {bezig ? "Even geduld…" : inbegrepen ? "Bestel (inbegrepen)" : "Bestel en betaal"}
        </button>
        <button type="button" onClick={onAnnuleer} className="btn-ghost px-5 py-2.5">
          Andere naam
        </button>
      </div>
    </section>
  );
}

function Aanvraag({ domein, soort, smal, onAnnuleer }: { domein: string; soort: Soort; smal: boolean; onAnnuleer: () => void }) {
  const id = useId();
  const [v, setV] = useState({ naam: "", bedrijf: "", email: "", telefoon: "", bericht: "", consent: false });
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [klaar, setKlaar] = useState(false);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    if (!v.consent) return setMelding("Zet het vinkje voor akkoord.");
    setBezig(true);
    setMelding(null);
    const r = await fetch("/api/domeinen/aanvraag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        domein,
        soort,
        naam: v.naam,
        email: v.email,
        consent: true,
        ...(v.bedrijf.trim() ? { bedrijf: v.bedrijf.trim() } : {}),
        ...(v.telefoon.trim() ? { telefoon: v.telefoon.trim() } : {}),
        ...(v.bericht.trim() ? { bericht: v.bericht.trim() } : {}),
      }),
    }).catch(() => null);
    setBezig(false);
    if (r?.ok) setKlaar(true);
    else setMelding(await fout(r, "Versturen lukte niet. Mail ons gerust: sales@zekerflex.com."));
  }

  if (klaar) {
    return (
      <p role="status" className="rounded-2xl border border-brand-500/30 bg-mintwash p-5 text-ink">
        <strong>Bedankt!</strong> We hebben je aanvraag voor <strong>{domein}</strong> ontvangen en nemen binnen één werkdag contact met je op
        {soort === "verhuizen" ? " over het verhuizen. Houd de verhuiscode van je huidige provider alvast bij de hand." : "."}
      </p>
    );
  }
  const veld = (k: "naam" | "bedrijf" | "email" | "telefoon", label: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`${id}-${k}`} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <input id={`${id}-${k}`} className={`${VELD} mt-1`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...extra} />
    </div>
  );
  return (
    <form onSubmit={(e) => void verstuur(e)} aria-label={soort === "registreren" ? `${domein} aanvragen` : `${domein} verhuizen`} className="rounded-2xl border border-hair bg-white p-5">
      <h3 className="font-display text-xl font-bold text-ink">{soort === "registreren" ? `${domein} aanvragen` : `${domein} verhuizen naar ZekerFlex`}</h3>
      <p className="mt-1 text-sm text-neutralx-600">
        {soort === "registreren"
          ? "We leggen de naam voor je vast en koppelen hem aan je website, webshop of e-mail. Je krijgt eerst een bevestiging met de prijs."
          : "Je houdt je domeinnaam; alleen de beheerder wordt ZekerFlex. Je website en mail blijven gewoon werken. Je hebt de verhuiscode van je huidige provider nodig."}
      </p>
      <div className={`mt-4 grid gap-4 ${smal ? "" : "sm:grid-cols-2"}`}>
        {veld("naam", "Je naam", { required: true, minLength: 2, maxLength: 120, autoComplete: "name" })}
        {veld("bedrijf", "Bedrijf (mag leeg)", { maxLength: 160, autoComplete: "organization" })}
        {veld("email", "E-mailadres", { required: true, type: "email", maxLength: 200, autoComplete: "email" })}
        {veld("telefoon", "Telefoon (mag leeg)", { type: "tel", maxLength: 40, autoComplete: "tel" })}
        <div className={smal ? "" : "sm:col-span-2"}>
          <label htmlFor={`${id}-bericht`} className="block text-sm font-semibold text-ink">
            Bericht (mag leeg)
          </label>
          <textarea id={`${id}-bericht`} className={`${VELD} mt-1`} rows={3} maxLength={2000} value={v.bericht} onChange={(e) => setV({ ...v, bericht: e.target.value })} />
        </div>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-neutralx-700">
        <input type="checkbox" className="mt-1" checked={v.consent} onChange={(e) => setV({ ...v, consent: e.target.checked })} />
        <span>ZekerFlex mag contact met me opnemen over deze aanvraag (zie het privacybeleid).</span>
      </label>
      {melding && (
        <p role="alert" className="mt-3 rounded-xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {melding}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={bezig} className="btn-primary px-5 py-2.5 disabled:opacity-60">
          {bezig ? "Versturen…" : soort === "registreren" ? "Vraag aan" : "Vraag verhuizing aan"}
        </button>
        <button type="button" onClick={onAnnuleer} className="btn-ghost px-5 py-2.5">
          Andere naam
        </button>
      </div>
    </form>
  );
}
