"use client";

import { useId, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { euroPrijs } from "@/lib/domeinen/extensies";

type Status = "vrij" | "bezet" | "waarschijnlijk-vrij" | "onbekend";
interface Resultaat {
  domein: string;
  tld: string;
  prijsCent: number | null;
  status: Status;
}
type Soort = "registreren" | "verhuizen";

const VELD = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-base text-ink";
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

// Zoek een domeinnaam, zie per extensie of hij vrij is en wat hij kost, en
// vraag hem aan (of verhuis je eigen domein). Twee losse formulieren, nooit
// genest. Leest /api/domeinen/zoek en post naar /api/domeinen/aanvraag.
export function DomeinZoeker({ startNaam = "" }: { startNaam?: string }) {
  const id = useId();
  const [zoek, setZoek] = useState(startNaam);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [res, setRes] = useState<Resultaat[] | null>(null);
  const [keuze, setKeuze] = useState<{ domein: string; soort: Soort } | null>(null);
  const [verhuis, setVerhuis] = useState("");

  async function zoeken(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setMelding(null);
    setKeuze(null);
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
      <form onSubmit={(e) => void zoeken(e)} role="search" aria-label="Domeinnaam zoeken" className="flex flex-col gap-3 sm:flex-row">
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
          {res.map((r) => {
            const kan = r.status === "vrij" || r.status === "waarschijnlijk-vrij" || r.status === "onbekend";
            return (
              <li key={r.domein} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1 break-all font-display text-lg font-bold text-ink">{r.domein}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LABEL[r.status].klasse}`}>{LABEL[r.status].tekst}</span>
                {r.prijsCent !== null && <span className="text-sm text-neutralx-700">{euroPrijs(r.prijsCent)} per jaar</span>}
                {kan ? (
                  <button type="button" className="btn-primary px-4 py-1.5 text-sm" onClick={() => setKeuze({ domein: r.domein, soort: "registreren" })}>
                    Kies {r.domein}
                  </button>
                ) : (
                  <button type="button" className="btn-ghost px-4 py-1.5 text-sm" onClick={() => setKeuze({ domein: r.domein, soort: "verhuizen" })}>
                    Is hij van jou? Verhuizen
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {res && <p className="text-xs text-neutralx-500">Prijzen per jaar, excl. btw. Bij het aanvragen controleren we de beschikbaarheid nog een keer.</p>}

      {!keuze && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (verhuis.trim()) setKeuze({ domein: verhuis.trim(), soort: "verhuizen" });
          }}
          aria-label="Domein verhuizen"
          className="rounded-2xl border border-hair bg-paper-soft p-4"
        >
          <label htmlFor={`${id}-verhuis`} className="block text-sm font-semibold text-ink">
            Heb je al een domeinnaam? Verhuis hem naar ZekerFlex
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input id={`${id}-verhuis`} className={`${VELD} sm:flex-1`} value={verhuis} onChange={(e) => setVerhuis(e.target.value)} placeholder="jouwbedrijf.nl" spellCheck={false} maxLength={120} />
            <button type="submit" className="btn-ghost justify-center px-5 py-2.5">
              Verhuizen
            </button>
          </div>
        </form>
      )}

      {keuze && <Aanvraag key={`${keuze.domein}-${keuze.soort}`} domein={keuze.domein} soort={keuze.soort} onAnnuleer={() => setKeuze(null)} />}
    </div>
  );
}

function Aanvraag({ domein, soort, onAnnuleer }: { domein: string; soort: Soort; onAnnuleer: () => void }) {
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
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {veld("naam", "Je naam", { required: true, minLength: 2, maxLength: 120, autoComplete: "name" })}
        {veld("bedrijf", "Bedrijf (mag leeg)", { maxLength: 160, autoComplete: "organization" })}
        {veld("email", "E-mailadres", { required: true, type: "email", maxLength: 200, autoComplete: "email" })}
        {veld("telefoon", "Telefoon (mag leeg)", { type: "tel", maxLength: 40, autoComplete: "tel" })}
        <div className="sm:col-span-2">
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
