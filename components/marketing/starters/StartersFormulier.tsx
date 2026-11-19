"use client";

import { useState } from "react";
import Link from "next/link";
import { STARTERS_GRENS } from "@/lib/starters/regels";

// "Vertel wat je wilt starten" op /starters. POST /api/starters maakt er een aanvraag van in de bestaande sales-pijplijn.

type Veld = "naam" | "email" | "idee" | "nodig";

export function StartersFormulier({ keuzes }: { keuzes: { slug: string; naam: string }[] }) {
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [idee, setIdee] = useState("");
  const [nodig, setNodig] = useState<string[]>([]);
  const [toelichting, setToelichting] = useState("");
  const [lokveld, setLokveld] = useState("");
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState(false);
  const [fout, setFout] = useState<{ tekst: string; veld?: Veld } | null>(null);

  const wissel = (slug: string) => setNodig((n) => (n.includes(slug) ? n.filter((x) => x !== slug) : [...n, slug]));

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (naam.trim().length < 2) return setFout({ tekst: "Vul je naam in.", veld: "naam" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setFout({ tekst: "Vul een geldig e-mailadres in.", veld: "email" });
    if (idee.trim().length < 2) return setFout({ tekst: "Vertel in een paar woorden wat je wilt starten.", veld: "idee" });
    if (nodig.length === 0) return setFout({ tekst: "Vink aan wat je nodig hebt.", veld: "nodig" });
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/starters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ naam, email, telefoon, idee, nodig, toelichting, website2: lokveld }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const veld = data?.error?.details?.veld;
        setFout({ tekst: data?.error?.message ?? "Het versturen is niet gelukt. Probeer het opnieuw.", ...(veld === "naam" || veld === "email" || veld === "idee" || veld === "nodig" ? { veld } : {}) });
        return;
      }
      setKlaar(true);
    } catch {
      setFout({ tekst: "Geen verbinding. Probeer het opnieuw." });
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    return (
      <div role="status" className="rounded-3xl border border-brand-200 bg-brand-50 p-6 sm:p-8">
        <h3 className="font-display text-xl font-bold text-ink">Gelukt, je aanvraag is binnen.</h3>
        <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">We nemen contact met je op. Je zit nergens aan vast en je betaalt niets voordat je zelf ja zegt.</p>
      </div>
    );
  }

  const beschrijf = (veld: Veld) => (fout?.veld === veld ? "starters-fout" : undefined);
  return (
    <form onSubmit={verstuur} noValidate className="rounded-3xl border border-hair bg-white p-5 shadow-card sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="st-naam" className="field-label">
            Je naam
          </label>
          <input id="st-naam" className="field-input" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={STARTERS_GRENS.naam} autoComplete="name" required aria-invalid={fout?.veld === "naam"} aria-describedby={beschrijf("naam")} />
        </div>
        <div>
          <label htmlFor="st-email" className="field-label">
            E-mailadres
          </label>
          <input id="st-email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={STARTERS_GRENS.email} autoComplete="email" required aria-invalid={fout?.veld === "email"} aria-describedby={beschrijf("email")} />
        </div>
        <div>
          <label htmlFor="st-telefoon" className="field-label">
            Telefoon <span className="font-normal text-neutralx-500">(mag leeg)</span>
          </label>
          <input id="st-telefoon" type="tel" className="field-input" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} maxLength={STARTERS_GRENS.telefoon} autoComplete="tel" />
        </div>
        <div>
          <label htmlFor="st-idee" className="field-label">
            Bedrijfsnaam of idee
          </label>
          <input id="st-idee" className="field-input" value={idee} onChange={(e) => setIdee(e.target.value)} maxLength={STARTERS_GRENS.idee} placeholder="Bijvoorbeeld: een fietsenmaker aan huis" required aria-invalid={fout?.veld === "idee"} aria-describedby={beschrijf("idee")} />
        </div>
      </div>
      <fieldset className="mt-5" aria-describedby={beschrijf("nodig")}>
        <legend className="field-label">Wat heb je nodig?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {keuzes.map((k) => (
            <label key={k.slug} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-ink ${nodig.includes(k.slug) ? "border-brand-600 bg-brand-50" : "border-hair"}`}>
              <input type="checkbox" checked={nodig.includes(k.slug)} onChange={() => wissel(k.slug)} className="h-4 w-4 accent-brand-600" />
              {k.naam}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5">
        <label htmlFor="st-toelichting" className="field-label">
          Korte toelichting <span className="font-normal text-neutralx-500">(mag leeg)</span>
        </label>
        <textarea id="st-toelichting" className="field-input min-h-[5.5rem] resize-y" value={toelichting} onChange={(e) => setToelichting(e.target.value)} maxLength={STARTERS_GRENS.toelichting} />
      </div>
      <div className="hidden" aria-hidden>
        <label htmlFor="st-website2">Laat dit veld leeg</label>
        <input id="st-website2" tabIndex={-1} autoComplete="off" value={lokveld} onChange={(e) => setLokveld(e.target.value)} />
      </div>
      {fout && (
        <p id="starters-fout" role="alert" className="mt-4 rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout.tekst}
        </p>
      )}
      <button type="submit" disabled={bezig} className="btn-primary mt-5 w-full justify-center px-6 py-3 text-base disabled:opacity-60">
        {bezig ? "Bezig…" : "Verstuur mijn aanvraag"}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-neutralx-500">
        We gebruiken je gegevens alleen om contact met je op te nemen over je aanvraag. Meer in onze{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          privacyverklaring
        </Link>
        .
      </p>
    </form>
  );
}
