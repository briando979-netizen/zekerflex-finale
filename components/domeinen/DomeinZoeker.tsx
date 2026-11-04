"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { euroPrijs, metBtw } from "@/lib/domeinen/extensies";

type Status = "vrij" | "bezet" | "waarschijnlijk-vrij" | "onbekend";
interface Resultaat {
  domein: string;
  tld: string;
  prijsCent: number | null;
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

type BestelStatus = "OPEN" | "BETAALD" | "GEREGISTREERD" | "MISLUKT" | "GEANNULEERD";
interface MijnDomein {
  id: string;
  domein: string;
  status: BestelStatus;
  bedragCent: number;
  bundel: boolean;
}
const BESTEL_LABEL: Record<BestelStatus, string> = {
  OPEN: "Wacht op betaling",
  BETAALD: "Betaald, we leggen hem vast",
  GEREGISTREERD: "Vastgelegd",
  MISLUKT: "Lukte niet, we nemen contact op",
  GEANNULEERD: "Geannuleerd",
};

// Zoek een domeinnaam, zie per extensie of hij vrij is en wat hij kost, en
// vraag hem aan (of verhuis je eigen domein). Een ingelogd bedrijf bestelt en
// betaalt meteen (/api/werkgever/domeinen) en ziet zijn domeinen. Losse
// formulieren, nooit genest. Leest /api/domeinen/zoek, post naar /api/domeinen/aanvraag.
export function DomeinZoeker({
  startNaam = "",
  terugNaar = "/domeinnaam",
  smal = false,
}: {
  startNaam?: string;
  /** waar je na de betaalpagina terugkomt (lib/domeinen/bestelling.ts TERUG_PADEN) */
  terugNaar?: string;
  /** in een smal paneel (zoals de websitebouwer): velden onder elkaar */
  smal?: boolean;
}) {
  const rij = smal ? "" : "sm:flex-row";
  const id = useId();
  const [zoek, setZoek] = useState(startNaam);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [res, setRes] = useState<Resultaat[] | null>(null);
  const [keuze, setKeuze] = useState<{ domein: string; soort: Soort; prijsCent: number | null } | null>(null);
  const [verhuis, setVerhuis] = useState("");
  const [werkgever, setWerkgever] = useState(false);
  const [mijn, setMijn] = useState<MijnDomein[] | null>(null);
  const [terug, setTerug] = useState<{ gelukt: boolean; domein: string } | null>(null);
  const [alles, setAlles] = useState(false);

  const laadMijn = useCallback(async () => {
    const r = await fetch("/api/werkgever/domeinen", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setMijn(((await r.json()) as { bestellingen: MijnDomein[] }).bestellingen);
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
                {r.prijsCent !== null && <span className="text-sm text-neutralx-700">{euroPrijs(r.prijsCent)} per jaar</span>}
                {kan ? (
                  <button
                    type="button"
                    aria-label={`Kies ${r.domein}`}
                    className={`btn-primary px-4 py-1.5 text-sm ${smal ? "ml-auto" : ""}`}
                    onClick={() => setKeuze({ domein: r.domein, soort: "registreren", prijsCent: r.prijsCent })}
                  >
                    {smal ? "Kies" : `Kies ${r.domein}`}
                  </button>
                ) : (
                  <button type="button" className="btn-ghost px-4 py-1.5 text-sm" onClick={() => setKeuze({ domein: r.domein, soort: "verhuizen", prijsCent: r.prijsCent })}>
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
            if (verhuis.trim()) setKeuze({ domein: verhuis.trim(), soort: "verhuizen", prijsCent: null });
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
          <Bestellen key={keuze.domein} domein={keuze.domein} prijsCent={keuze.prijsCent} terugNaar={terugNaar} onAnnuleer={() => setKeuze(null)} onKlaar={() => void laadMijn()} />
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
            ? `Betaling gelukt! We leggen ${terug.domein || "je domeinnaam"} binnen één werkdag voor je vast en mailen je zodra hij klaar is.`
            : `Je hebt het betalen afgebroken. ${terug.domein || "De domeinnaam"} is nog niet besteld; je kunt het gewoon opnieuw proberen.`}
        </p>
      )}

      {werkgever && mijn && mijn.length > 0 && <MijnDomeinen lijst={mijn} />}
    </div>
  );
}

function MijnDomeinen({ lijst }: { lijst: MijnDomein[] }) {
  return (
    <section aria-labelledby="mijn-domeinen" className="rounded-2xl border border-hair bg-white p-5">
      <h3 id="mijn-domeinen" className="font-display text-lg font-bold text-ink">
        Jouw domeinnamen
      </h3>
      <ul className="mt-3 divide-y divide-hair text-sm">
        {lijst.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="break-all font-semibold text-ink">{d.domein}</span>
            <span className="text-neutralx-600">
              {BESTEL_LABEL[d.status]}
              {d.bundel ? " · in de bundel" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bestellen({ domein, prijsCent, terugNaar, onAnnuleer, onKlaar }: { domein: string; prijsCent: number; terugNaar: string; onAnnuleer: () => void; onKlaar: () => void }) {
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [bundel, setBundel] = useState(false);
  const p = metBtw(prijsCent);

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
        <strong>{domein} is besteld!</strong> Het eerste jaar is inbegrepen bij je websiteabonnement. We leggen hem binnen één werkdag voor je vast en mailen je
        zodra hij klaar is.
      </p>
    );
  }
  return (
    <section aria-label={`${domein} bestellen`} className="rounded-2xl border border-hair bg-white p-5">
      <h3 className="font-display text-xl font-bold text-ink">{domein} bestellen</h3>
      <dl className="mt-3 max-w-sm space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-neutralx-600">Domeinnaam, 1 jaar</dt>
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
      </dl>
      <p className="mt-3 text-sm text-neutralx-600">
        Je betaalt met iDEAL of je kaart. Heb je een websiteabonnement van ZekerFlex, dan is je eerste .nl, .com, .eu of .be het eerste jaar inbegrepen; dat zie je
        meteen. Daarna verlengt hij per jaar, opzeggen kan altijd voor de verlengdatum.
      </p>
      {melding && (
        <p role="alert" className="mt-3 rounded-xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {melding}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={bezig} onClick={() => void bestel()} className="btn-primary px-5 py-2.5 disabled:opacity-60">
          {bezig ? "Even geduld…" : "Bestel en betaal"}
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
