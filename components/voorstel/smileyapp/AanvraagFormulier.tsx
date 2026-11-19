"use client";

import { useState, type FormEvent } from "react";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

// Het werkende formulier van het SmileyApp-voorstel (19 nov 2026): een
// demo-aanvraag of een partner-aanmelding. Het stuurt naar
// /api/voorstel/smileyapp/aanvraag; de aanvraag komt alleen in het eigen beheer
// (er gaat niets naar derden). Na het versturen staat de bevestiging op dezelfde
// plek. Alle keuzes (pakketten, dagen, tijden, interesses) komen als gewone
// gegevens van de pagina, dus dit bestand laadt niets van de server.

const VELD =
  "mt-1.5 w-full rounded-2xl border-0 bg-smiley-cream px-4 py-3 text-base text-smiley-ink ring-1 ring-smiley-ink/15 focus:outline-none focus:ring-2 focus:ring-smiley-leaf aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-smiley-coral";
const LABEL = "block text-sm font-semibold text-smiley-ink";

export interface Keuze {
  waarde: string;
  label: string;
}

interface Props {
  soort: "demo" | "partner";
  kop: string;
  /** e-mailadres voor wie liever mailt */
  mail: string;
  /** false: niemand van SmileyApp kan nog in het beheer inloggen, dus niemand leest de aanvraag */
  teamActief: boolean;
  /** demo: de pakketten (alleen de namen) en het vooraf gekozen pakket */
  pakketten?: readonly Keuze[];
  gekozenPakket?: string;
  /** demo: de dagen en tijden voor een belmoment */
  dagen?: readonly Keuze[];
  tijden?: readonly string[];
  /** partner: waar iemand interesse in heeft */
  interesses?: readonly string[];
}

export function AanvraagFormulier({ soort, kop, mail, teamActief, pakketten = [], gekozenPakket = "", dagen = [], tijden = [], interesses = [] }: Props) {
  const id = `sm-${soort}`;
  const [naam, setNaam] = useState("");
  const [bedrijf, setBedrijf] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [pakket, setPakket] = useState(gekozenPakket);
  const [gekozen, setGekozen] = useState<string[]>([]);
  const [dag, setDag] = useState("");
  const [tijd, setTijd] = useState("");
  const [bericht, setBericht] = useState("");
  const [toestemming, setToestemming] = useState(false);
  const [lokveld, setLokveld] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<{ veld: string; tekst: string } | null>(null);
  const [klaar, setKlaar] = useState(false);

  const fouteVeld = (veld: string) => (fout?.veld === veld ? { "aria-invalid": true as const, "aria-describedby": `${id}-fout` } : {});
  const wissel = (i: string) => setGekozen((g) => (g.includes(i) ? g.filter((x) => x !== i) : [...g, i]));

  async function verstuur(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bezig) return;
    if (!toestemming) {
      setFout({ veld: "toestemming", tekst: "Vink aan dat SmileyApp contact met je mag opnemen over deze aanvraag." });
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/voorstel/smileyapp/aanvraag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          soort,
          naam,
          bedrijf,
          email,
          telefoon,
          bericht,
          toestemming,
          lokveld,
          ...(soort === "demo" ? { pakket, dag, tijd } : { interesses: gekozen }),
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: { message?: string; details?: { veld?: string } } };
      if (!r.ok) {
        setFout({ veld: d.error?.details?.veld ?? "", tekst: d.error?.message ?? "Versturen lukte niet. Probeer het opnieuw." });
        return;
      }
      setKlaar(true);
    } catch {
      setFout({ veld: "", tekst: "Versturen lukte niet. Controleer je internetverbinding en probeer het opnieuw." });
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    const moment = dag && tijd ? `${dagen.find((d) => d.waarde === dag)?.label ?? dag} om ${tijd} uur` : "";
    return (
      <section aria-labelledby={`${id}-kop`} className="rounded-[2rem] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(14,42,32,0.45)] ring-1 ring-smiley-ink/10 sm:p-8">
        <div role="status" className="text-center">
          <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" knipoog className="sm-wiebel mx-auto h-20 w-20" />
          <h2 id={`${id}-kop`} className="mt-5 font-display text-2xl font-bold text-smiley-ink sm:text-3xl">
            Bedankt, je {soort === "demo" ? "aanvraag" : "aanmelding"} is binnen
          </h2>
          <p className="mx-auto mt-3 max-w-md leading-relaxed text-smiley-mute">
            {moment ? `We bellen je op of rond ${moment}. Dat moment is je voorkeur, nog geen vaste afspraak.` : "We nemen contact met je op via je e-mailadres of telefoonnummer."}
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-smiley-mute">
            Klopt er iets niet of wil je iets toevoegen? Mail naar{" "}
            <a href={`mailto:${mail}`} className="font-semibold text-smiley-leaf underline underline-offset-2">
              {mail}
            </a>
            .
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-kop`} className="relative rounded-[2rem] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(14,42,32,0.45)] ring-1 ring-smiley-ink/10 sm:p-8">
      <h2 id={`${id}-kop`} className="font-display text-2xl font-bold text-smiley-ink sm:text-3xl">
        {kop}
      </h2>
      {!teamActief && (
        <p className="mt-4 rounded-2xl bg-smiley-sun/35 p-4 text-sm font-semibold leading-relaxed text-smiley-ink">
          Let op: dit is een ontwerpvoorstel. Zolang SmileyApp dit beheer nog niet gebruikt, leest niemand van SmileyApp wat je hier instuurt. Mail voor nu naar{" "}
          <a href={`mailto:${mail}`} className="underline underline-offset-2">
            {mail}
          </a>
          .
        </p>
      )}
      <form onSubmit={(e) => void verstuur(e)} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-naam`} className={LABEL}>
            Naam
          </label>
          <input id={`${id}-naam`} type="text" autoComplete="name" required minLength={2} maxLength={80} value={naam} onChange={(e) => setNaam(e.target.value)} className={VELD} {...fouteVeld("naam")} />
        </div>
        <div>
          <label htmlFor={`${id}-bedrijf`} className={LABEL}>
            Bedrijf of organisatie
          </label>
          <input id={`${id}-bedrijf`} type="text" autoComplete="organization" required minLength={2} maxLength={120} value={bedrijf} onChange={(e) => setBedrijf(e.target.value)} className={VELD} {...fouteVeld("bedrijf")} />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={LABEL}>
            E-mailadres
          </label>
          <input id={`${id}-email`} type="email" autoComplete="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={VELD} {...fouteVeld("email")} />
        </div>
        <div>
          <label htmlFor={`${id}-telefoon`} className={LABEL}>
            Telefoonnummer{soort === "partner" && <span className="font-normal text-smiley-mute"> (mag leeg)</span>}
          </label>
          <input id={`${id}-telefoon`} type="tel" autoComplete="tel" maxLength={25} value={telefoon} onChange={(e) => setTelefoon(e.target.value)} className={VELD} {...fouteVeld("telefoon")} />
        </div>

        {soort === "demo" && (
          <>
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-pakket`} className={LABEL}>
                Welk pakket wil je zien?
              </label>
              <select id={`${id}-pakket`} value={pakket} onChange={(e) => setPakket(e.target.value)} className={VELD} {...fouteVeld("pakket")}>
                <option value="">Weet ik nog niet</option>
                {pakketten.map((p) => (
                  <option key={p.waarde} value={p.waarde}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-dag`} className={LABEL}>
                Voorkeursdag
              </label>
              <select id={`${id}-dag`} value={dag} onChange={(e) => setDag(e.target.value)} className={VELD} {...fouteVeld("dag")}>
                <option value="">Geen voorkeur</option>
                {dagen.map((d) => (
                  <option key={d.waarde} value={d.waarde}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-tijd`} className={LABEL}>
                Voorkeurstijd
              </label>
              <select id={`${id}-tijd`} value={tijd} onChange={(e) => setTijd(e.target.value)} className={VELD} {...fouteVeld("tijd")}>
                <option value="">Geen voorkeur</option>
                {tijden.map((t) => (
                  <option key={t} value={t}>
                    {t} uur
                  </option>
                ))}
              </select>
            </div>
            <p className="-mt-1 text-sm leading-relaxed text-smiley-mute sm:col-span-2">
              We bellen je op of rond dit moment (werkdagen tussen 09:00 en 17:00 uur). Het is je voorkeur, geen vaste afspraak.
            </p>
          </>
        )}

        {soort === "partner" && interesses.length > 0 && (
          <fieldset className="sm:col-span-2" {...(fout?.veld === "interesses" ? { "aria-describedby": `${id}-fout` } : {})}>
            <legend className={LABEL}>Ik ben geïnteresseerd in</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {interesses.map((i) => {
                const aan = gekozen.includes(i);
                return (
                  <label
                    key={i}
                    className={`relative cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1 transition-colors focus-within:ring-2 focus-within:ring-smiley-leaf ${aan ? "bg-smiley-ink text-white ring-smiley-ink" : "bg-smiley-cream text-smiley-ink ring-smiley-ink/15 hover:bg-smiley-mint"}`}
                  >
                    <input type="checkbox" checked={aan} onChange={() => wissel(i)} className="sr-only" />
                    {i}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-bericht`} className={LABEL}>
            {soort === "demo" ? "Wat wil je graag zien of weten?" : "Vertel kort iets over je bedrijf of event"}
            <span className="font-normal text-smiley-mute"> (mag leeg)</span>
          </label>
          <textarea id={`${id}-bericht`} rows={4} maxLength={2000} value={bericht} onChange={(e) => setBericht(e.target.value)} className={VELD} {...fouteVeld("bericht")} />
        </div>

        {/* lokveld: een mens ziet het niet en laat het leeg; een robot vult het in en wordt dan stil genegeerd */}
        <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0">
          <label htmlFor={`${id}-lok`}>Laat dit veld leeg</label>
          <input id={`${id}-lok`} type="text" name="website_url" tabIndex={-1} autoComplete="off" value={lokveld} onChange={(e) => setLokveld(e.target.value)} />
        </div>

        <div className="relative flex items-start gap-3 sm:col-span-2">
          <input
            id={`${id}-toestemming`}
            type="checkbox"
            checked={toestemming}
            onChange={(e) => setToestemming(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-smiley-ink/30 text-smiley-leaf focus:ring-smiley-leaf"
            {...fouteVeld("toestemming")}
          />
          <label htmlFor={`${id}-toestemming`} className="text-sm leading-relaxed text-smiley-ink">
            SmileyApp mag mij bellen of mailen over deze {soort === "demo" ? "aanvraag" : "aanmelding"}.
          </label>
        </div>

        {fout && (
          <p id={`${id}-fout`} role="alert" className="rounded-2xl bg-smiley-coral/15 p-4 text-sm font-semibold text-[#8E2A1E] sm:col-span-2">
            {fout.tekst}
          </p>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={bezig} className="w-full rounded-full bg-smiley-ink px-7 py-4 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60 sm:w-auto">
            {bezig ? "Bezig met versturen…" : soort === "demo" ? "Vraag de demo aan" : "Meld je aan als partner"}
          </button>
        </div>
      </form>
    </section>
  );
}
