"use client";

import { useState } from "react";
import { BUDGET, FUNCTIES, KLEUREN, LOGO, PAGINAS, SOORTEN, STIJLEN, VIDEO, VOORBEELDEN, WANNEER } from "@/lib/website/aanvraag-opties";

// Het wensenformulier op /website-maken (19 nov 2026): de klant kiest en vult aan, de aanvraag komt als lead in Beheer → Sales
// (app/api/website-aanvraag). Alleen keuzes uit lib/website/aanvraag-opties.ts, zodat formulier en server dezelfde lijst lezen.

const inp = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2.5 text-[15px] text-ink";
const lbl = "mb-1 block text-sm font-semibold text-ink";
const groep = "rounded-2xl border border-hair bg-white p-5 md:p-6";
const kop = "font-display text-lg font-bold text-ink";

function chip(aan: boolean) {
  return `rounded-full px-4 py-2 text-sm font-semibold transition ${aan ? "bg-ink text-white" : "bg-paper-soft text-ink ring-1 ring-black/10 hover:ring-black/30"}`;
}

/** Eén keuze uit een rijtje (nog een keer tikken haalt de keuze weg). */
function Keuze({ titel, opties, waarde, kies }: { titel: string; opties: readonly string[]; waarde: string; kies: (v: string) => void }) {
  return (
    <fieldset>
      <legend className={lbl}>{titel}</legend>
      <div className="flex flex-wrap gap-2">
        {opties.map((o) => (
          <button key={o} type="button" aria-pressed={waarde === o} onClick={() => kies(waarde === o ? "" : o)} className={chip(waarde === o)}>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Meerdere keuzes uit een rijtje. */
function Meerdere({ titel, opties, waarden, wissel }: { titel: string; opties: readonly string[]; waarden: string[]; wissel: (v: string) => void }) {
  return (
    <fieldset>
      <legend className={lbl}>{titel}</legend>
      <div className="flex flex-wrap gap-2">
        {opties.map((o) => (
          <button key={o} type="button" aria-pressed={waarden.includes(o)} onClick={() => wissel(o)} className={chip(waarden.includes(o))}>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const LEEG = { bedrijf: "", naam: "", email: "", telefoon: "", huidigeSite: "", branche: "", soort: "Website", eigenKleur: "", stijl: "", video: "", logo: "", budget: "", wanneer: "", voorbeeld: "", wensen: "", akkoord: false };

export function WebsiteAanvraagFormulier() {
  const [f, setF] = useState(LEEG);
  const [kleuren, setKleuren] = useState<string[]>([]);
  const [paginas, setPaginas] = useState<string[]>(["Home", "Contact"]);
  const [functies, setFuncties] = useState<string[]>(["Contactformulier"]);
  const [status, setStatus] = useState<"idle" | "bezig" | "klaar" | "fout">("idle");
  const [fout, setFout] = useState("");
  const zet = (k: keyof typeof LEEG) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const wissel = (lijst: string[], set: (v: string[]) => void) => (v: string) => set(lijst.includes(v) ? lijst.filter((x) => x !== v) : [...lijst, v]);

  async function verstuur() {
    if (status === "bezig") return;
    if (f.bedrijf.trim().length < 2 || f.naam.trim().length < 2 || !f.email.includes("@")) {
      setFout("Vul je bedrijfsnaam, je naam en je e-mailadres in.");
      return;
    }
    if (!f.akkoord) {
      setFout("Zet het vinkje voor akkoord.");
      return;
    }
    setStatus("bezig");
    setFout("");
    const tekst = (v: string) => (v.trim() ? v.trim() : undefined);
    try {
      const res = await fetch("/api/website-aanvraag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bedrijf: f.bedrijf.trim(), naam: f.naam.trim(), email: f.email.trim(), telefoon: tekst(f.telefoon), huidigeSite: tekst(f.huidigeSite), branche: tekst(f.branche),
          soort: f.soort, kleuren, eigenKleur: tekst(f.eigenKleur), stijl: tekst(f.stijl), video: tekst(f.video), logo: tekst(f.logo), paginas, functies,
          budget: tekst(f.budget), wanneer: tekst(f.wanneer), voorbeeld: tekst(f.voorbeeld), wensen: tekst(f.wensen), akkoord: true,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (res.ok) setStatus("klaar");
      else {
        setStatus("fout");
        setFout(d?.error?.message ?? "Versturen is niet gelukt. Probeer het later opnieuw.");
      }
    } catch {
      setStatus("fout");
      setFout("Geen verbinding. Probeer het later opnieuw.");
    }
  }

  if (status === "klaar") {
    return (
      <div className={`${groep} text-center`} role="status">
        <p className="font-display text-2xl font-bold text-ink">Bedankt, je aanvraag is binnen</p>
        <p className="mx-auto mt-3 max-w-xl text-neutralx-600">We gaan voor je aan de slag. Binnen een dag krijg je een voorbeeld in drie versies in je mail. Kies de versie die het beste past, dan maken wij hem af.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className={groep}>
        <h3 className={kop}>1. Over jou</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={lbl} htmlFor="wa-bedrijf">Bedrijfsnaam</label>
            <input id="wa-bedrijf" className={inp} value={f.bedrijf} onChange={(e) => zet("bedrijf")(e.target.value)} autoComplete="organization" />
          </div>
          <div>
            <label className={lbl} htmlFor="wa-naam">Je naam</label>
            <input id="wa-naam" className={inp} value={f.naam} onChange={(e) => zet("naam")(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className={lbl} htmlFor="wa-email">E-mailadres</label>
            <input id="wa-email" type="email" className={inp} value={f.email} onChange={(e) => zet("email")(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className={lbl} htmlFor="wa-telefoon">Telefoon (mag leeg)</label>
            <input id="wa-telefoon" type="tel" className={inp} value={f.telefoon} onChange={(e) => zet("telefoon")(e.target.value)} autoComplete="tel" />
          </div>
          <div>
            <label className={lbl} htmlFor="wa-branche">Wat voor bedrijf heb je?</label>
            <input id="wa-branche" className={inp} value={f.branche} onChange={(e) => zet("branche")(e.target.value)} placeholder="Bijvoorbeeld: bakkerij, kapper, installateur" />
          </div>
          <div>
            <label className={lbl} htmlFor="wa-site">Heb je al een website? (mag leeg)</label>
            <input id="wa-site" className={inp} value={f.huidigeSite} onChange={(e) => zet("huidigeSite")(e.target.value)} placeholder="jouwbedrijf.nl" inputMode="url" />
          </div>
        </div>
      </div>

      <div className={`${groep} grid gap-5`}>
        <h3 className={kop}>2. Wat wil je laten maken?</h3>
        <Keuze titel="Soort" opties={SOORTEN} waarde={f.soort} kies={(v) => zet("soort")(v || "Website")} />
        <Keuze titel="Welk voorbeeld spreekt je het meest aan?" opties={VOORBEELDEN.map((v) => v.naam)} waarde={f.voorbeeld} kies={zet("voorbeeld")} />
        <Meerdere titel="Welke pagina's wil je?" opties={PAGINAS} waarden={paginas} wissel={wissel(paginas, setPaginas)} />
        <Meerdere titel="Wat moet de site kunnen?" opties={FUNCTIES} waarden={functies} wissel={wissel(functies, setFuncties)} />
      </div>

      <div className={`${groep} grid gap-5`}>
        <h3 className={kop}>3. Hoe moet het eruitzien?</h3>
        <fieldset>
          <legend className={lbl}>Kleuren (kies er een of meer)</legend>
          <div className="flex flex-wrap gap-2">
            {KLEUREN.map((k) => {
              const aan = kleuren.includes(k.naam);
              return (
                <button key={k.naam} type="button" aria-pressed={aan} onClick={() => wissel(kleuren, setKleuren)(k.naam)} className={`${chip(aan)} inline-flex items-center gap-2`}>
                  {k.hex ? <span aria-hidden className="h-4 w-4 rounded-full ring-1 ring-black/20" style={{ backgroundColor: k.hex }} /> : null}
                  {k.naam}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div>
          <label className={lbl} htmlFor="wa-kleur">Een andere kleur of kleurcode (mag leeg)</label>
          <input id="wa-kleur" className={inp} value={f.eigenKleur} onChange={(e) => zet("eigenKleur")(e.target.value)} placeholder="Bijvoorbeeld: donkergroen met goud" />
        </div>
        <Keuze titel="Stijl" opties={STIJLEN} waarde={f.stijl} kies={zet("stijl")} />
        <Keuze titel="Video's" opties={VIDEO} waarde={f.video} kies={zet("video")} />
        <Keuze titel="Logo" opties={LOGO} waarde={f.logo} kies={zet("logo")} />
      </div>

      <div className={`${groep} grid gap-5`}>
        <h3 className={kop}>4. Budget en planning</h3>
        <Keuze titel="Budget" opties={BUDGET} waarde={f.budget} kies={zet("budget")} />
        <Keuze titel="Wanneer wil je hem hebben?" opties={WANNEER} waarde={f.wanneer} kies={zet("wanneer")} />
        <div>
          <label className={lbl} htmlFor="wa-wensen">Nog iets wat we moeten weten?</label>
          <textarea id="wa-wensen" rows={5} className={inp} value={f.wensen} onChange={(e) => zet("wensen")(e.target.value)} placeholder="Vertel in je eigen woorden wat je voor ogen hebt. Links naar sites die je mooi vindt mogen ook." />
        </div>
      </div>

      <div className={groep}>
        <label className="flex items-start gap-3 text-sm text-neutralx-600">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={f.akkoord} onChange={(e) => setF((o) => ({ ...o, akkoord: e.target.checked }))} />
          <span>ZekerFlex mag mijn gegevens gebruiken om mij een voorbeeld te sturen en contact met mij op te nemen over deze aanvraag.</span>
        </label>
        {fout ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
            {fout}
          </p>
        ) : null}
        <button type="button" onClick={() => void verstuur()} disabled={status === "bezig"} className="btn-mint mt-4 px-6 py-3 disabled:opacity-60">
          {status === "bezig" ? "Bezig met versturen" : "Verstuur mijn wensen"}
        </button>
        <p className="mt-3 text-sm text-neutralx-600">Je zit nergens aan vast. Je krijgt eerst een voorbeeld te zien.</p>
      </div>
    </div>
  );
}
