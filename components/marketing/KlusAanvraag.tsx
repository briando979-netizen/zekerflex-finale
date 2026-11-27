"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { meldOntbreekt, meldVerstuurd } from "@/components/analytics/formulier";
import { aanvraagOntbreekt, type AanvraagKlus } from "@/lib/klusconcept/aanvraag";

/**
 * /klus-plaatsen, onder de plaatsknop: "Liever zonder account? Wij zetten je klus voor je online" (lib/klusconcept/aanvraag.ts,
 * POST /api/klus-plaatsen/aanvraag). Alleen naam, bedrijf en een telefoonnummer of e-mailadres; de klus van het formulier gaat
 * mee. De knop staat altijd aan: ontbreekt er iets, dan zegt de melding wat (role="alert"), en dat meten we als code
 * (formulier "klus-aanvraag"). Een eigen <form>, buiten het websiteformulier van KlusConcept.
 */
const veldStijl = "mt-1 min-h-11 w-full rounded-xl border border-hair bg-paper px-4 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500";

export function KlusAanvraag({ klus, bedrijfVoorstel = "" }: { klus: AanvraagKlus; bedrijfVoorstel?: string }) {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [bedrijf, setBedrijf] = useState(bedrijfVoorstel);
  const [telefoon, setTelefoon] = useState("");
  const [email, setEmail] = useState("");
  const [extra, setExtra] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<string | null>(null);

  async function verstuur(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bezig) return;
    const mist = aanvraagOntbreekt({ naam, bedrijf, telefoon, email });
    if (mist) {
      setFout(mist.tekst);
      meldOntbreekt("klus-aanvraag", mist.veld);
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/klus-plaatsen/aanvraag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam, bedrijf, telefoon, email, extra, klus }),
      });
      const d = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!r.ok) {
        setFout(d?.error?.message ?? "Versturen lukte niet. Probeer het opnieuw, of mail ons op sales@zekerflex.com.");
        return;
      }
      meldVerstuurd("klus-aanvraag");
      setKlaar(`Dank je, ${naam.trim()}. We nemen binnen één werkdag contact met je op en zetten je klus samen met je online.`);
    } catch {
      setFout("Geen verbinding. Controleer je internet en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    return (
      <p role="status" className="mt-5 rounded-2xl bg-mintwash p-4 text-sm font-medium text-brand-700">
        {klaar}
      </p>
    );
  }

  if (!open) {
    return (
      <div className="mt-5 border-t border-hair pt-5">
        <p className="text-sm font-semibold text-ink">Liever zonder account?</p>
        <p className="mt-1 text-sm text-neutralx-600">Laat je naam en nummer achter. Wij nemen contact op en zetten je klus samen met je online.</p>
        <button type="button" data-track="klus-aanvraag-open" onClick={() => setOpen(true)} className="btn-ghost mt-3 w-full">
          Zet mijn klus voor me online
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void verstuur(e)} noValidate className="mt-5 space-y-3 border-t border-hair pt-5" data-track-ctx="stap=klus-aanvraag">
      <p className="text-sm font-semibold text-ink">Wij zetten je klus voor je online</p>
      <p className="text-sm text-neutralx-600">De klus hierboven gaat mee. Telefoon of e-mail is genoeg.</p>
      <div>
        <label htmlFor="aanvraag-naam" className="block text-sm font-medium text-ink">
          Je naam
        </label>
        <input id="aanvraag-naam" name="naam" autoComplete="name" value={naam} onChange={(e) => setNaam(e.target.value)} className={veldStijl} />
      </div>
      <div>
        <label htmlFor="aanvraag-bedrijf" className="block text-sm font-medium text-ink">
          Bedrijf
        </label>
        <input id="aanvraag-bedrijf" name="bedrijf" autoComplete="organization" value={bedrijf} onChange={(e) => setBedrijf(e.target.value)} className={veldStijl} />
      </div>
      <div>
        <label htmlFor="aanvraag-telefoon" className="block text-sm font-medium text-ink">
          Telefoonnummer
        </label>
        <input id="aanvraag-telefoon" name="telefoon" type="tel" autoComplete="tel" inputMode="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} className={veldStijl} />
      </div>
      <div>
        <label htmlFor="aanvraag-email" className="block text-sm font-medium text-ink">
          Of je e-mailadres
        </label>
        <input id="aanvraag-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={veldStijl} />
      </div>
      {/* botveld: onzichtbaar voor mensen en schermlezers; een bot vult het in */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="aanvraag-extra">Laat dit veld leeg</label>
        <input id="aanvraag-extra" name="extra" tabIndex={-1} autoComplete="off" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </div>
      {fout ? (
        <p role="alert" className="text-sm font-medium text-crit">
          {fout}
        </p>
      ) : null}
      <button type="submit" data-track="klus-aanvraag-stuur" disabled={bezig} className="btn-primary w-full disabled:opacity-50">
        {bezig ? "Even geduld…" : "Stuur mijn klus"}
      </button>
      <p className="text-xs leading-relaxed text-neutralx-500">
        We gebruiken je gegevens alleen om over deze klus contact met je op te nemen. Zie de{" "}
        <Link href="/privacy" className="underline">
          privacyverklaring
        </Link>
        .
      </p>
    </form>
  );
}
