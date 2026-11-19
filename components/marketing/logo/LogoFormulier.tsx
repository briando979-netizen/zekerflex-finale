"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KLEUREN, STANDAARD_KLEUR, type KleurId } from "@/lib/advertentie/regels";
import { BRANCHES, LOGO_GRENS, SFEREN, type BrancheId, type SfeerId } from "@/lib/logo/regels";

// Het formulier op /logo-maker: naam, slogan, soort bedrijf, kleur en sfeer. Geen account en geen e-mailadres.
// POST /api/logo-maker geeft het id terug; daarna gaat de bezoeker naar zijn pagina met zes logo's.

export function LogoFormulier() {
  const router = useRouter();
  const [naam, setNaam] = useState("");
  const [slogan, setSlogan] = useState("");
  const [branche, setBranche] = useState<BrancheId>("anders");
  const [brancheTekst, setBrancheTekst] = useState("");
  const [kleur, setKleur] = useState<KleurId>(STANDAARD_KLEUR);
  const [sfeer, setSfeer] = useState<SfeerId>("strak");
  const [lokveld, setLokveld] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (naam.trim().length < 2) return setFout("Vul de naam van je bedrijf in.");
    setBezig(true);
    setFout("");
    try {
      const res = await fetch("/api/logo-maker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam, slogan, branche, brancheTekst, kleur, sfeer, website2: lokveld }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.id !== "string") {
        setFout(data?.error?.message ?? "Het maken is niet gelukt. Probeer het opnieuw.");
        setBezig(false);
        return;
      }
      router.push(`/logo-maker/${data.id}`);
    } catch {
      setFout("Geen verbinding. Probeer het opnieuw.");
      setBezig(false);
    }
  }

  return (
    <form onSubmit={verstuur} noValidate className="rounded-3xl bg-white p-5 text-ink shadow-e2 sm:p-7" aria-labelledby="logo-form-kop">
      <h2 id="logo-form-kop" className="font-display text-xl font-bold text-ink">
        Maak je logo
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">Vul je naam in en kies een sfeer. Je ziet meteen zes logo&apos;s.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="logo-naam" className="field-label">
            Naam van je bedrijf
          </label>
          <input id="logo-naam" className="field-input" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={LOGO_GRENS.naam} autoComplete="organization" required aria-invalid={Boolean(fout)} aria-describedby={fout ? "logo-fout" : undefined} disabled={bezig} />
        </div>
        <div>
          <label htmlFor="logo-slogan" className="field-label">
            Slogan of onderregel <span className="font-normal text-neutralx-500">(mag leeg)</span>
          </label>
          <input id="logo-slogan" className="field-input" value={slogan} onChange={(e) => setSlogan(e.target.value)} maxLength={LOGO_GRENS.slogan} disabled={bezig} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="logo-branche" className="field-label">
              Soort bedrijf
            </label>
            <select id="logo-branche" className="field-input" value={branche} onChange={(e) => setBranche(e.target.value as BrancheId)} disabled={bezig}>
              {BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.naam}
                </option>
              ))}
            </select>
          </div>
          {branche === "anders" && (
            <div>
              <label htmlFor="logo-branche-tekst" className="field-label">
                Wat voor bedrijf? <span className="font-normal text-neutralx-500">(mag leeg)</span>
              </label>
              <input id="logo-branche-tekst" className="field-input" value={brancheTekst} onChange={(e) => setBrancheTekst(e.target.value)} maxLength={LOGO_GRENS.brancheTekst} disabled={bezig} />
            </div>
          )}
        </div>
        <fieldset>
          <legend className="field-label">Sfeer</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {SFEREN.map((s) => (
              <label key={s.id} className={`relative cursor-pointer rounded-xl border-2 px-3 py-2.5 ${sfeer === s.id ? "border-brand-600 bg-brand-50" : "border-hair"}`}>
                <input type="radio" name="logo-sfeer" value={s.id} checked={sfeer === s.id} onChange={() => setSfeer(s.id)} className="sr-only" disabled={bezig} />
                <span className="block text-sm font-semibold text-ink">{s.naam}</span>
                <span className="block text-xs text-neutralx-600">{s.uitleg}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="hidden" aria-hidden>
          <label htmlFor="logo-website2">Laat dit veld leeg</label>
          <input id="logo-website2" tabIndex={-1} autoComplete="off" value={lokveld} onChange={(e) => setLokveld(e.target.value)} />
        </div>
        <fieldset>
          <legend className="field-label">Kleur</legend>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {KLEUREN.map((k) => (
              <label key={k.id} className="relative cursor-pointer">
                <input type="radio" name="logo-kleur" value={k.id} checked={kleur === k.id} onChange={() => setKleur(k.id)} className="peer sr-only" disabled={bezig} />
                <span className="block h-10 w-10 rounded-full border-2 border-white shadow-sm ring-2 ring-hair transition peer-checked:ring-[3px] peer-checked:ring-ink peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand-500" style={{ background: k.hex }} aria-hidden />
                <span className="sr-only">{k.naam}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {fout && !bezig && (
        <p id="logo-fout" role="alert" className="mt-4 rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      <button type="submit" disabled={bezig} className="btn-primary mt-5 w-full justify-center px-6 py-3 text-base disabled:opacity-60">
        {bezig ? "Bezig…" : "Laat mijn logo's zien"}
      </button>
      <p className="mt-3 text-center text-xs text-neutralx-500">Geen account, geen e-mailadres nodig. Je betaalt pas als je het wilt hebben.</p>
    </form>
  );
}
