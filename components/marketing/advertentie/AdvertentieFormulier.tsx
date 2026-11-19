"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GRENS, KLEUREN, STANDAARD_KLEUR, type KleurId } from "@/lib/advertentie/regels";

// Het formulier op /advertentie-op-maat: een paar velden, geen account en geen e-mailadres. POST /api/advertentie geeft
// het id terug; daarna gaat de bezoeker naar zijn eigen pagina met de drie ontwerpen.

const STAPPEN = ["Je gegevens lezen", "De tekst schrijven", "Drie ontwerpen opmaken"];

type Veld = "bedrijf" | "aanbod";

export function AdvertentieFormulier() {
  const router = useRouter();
  const [bedrijf, setBedrijf] = useState("");
  const [aanbod, setAanbod] = useState("");
  const [plaats, setPlaats] = useState("");
  const [boodschap, setBoodschap] = useState("");
  const [contact, setContact] = useState("");
  const [kleur, setKleur] = useState<KleurId>(STANDAARD_KLEUR);
  const [lokveld, setLokveld] = useState("");
  const [bezig, setBezig] = useState(false);
  const [stap, setStap] = useState(0);
  const [fout, setFout] = useState<{ tekst: string; veld?: Veld } | null>(null);

  useEffect(() => {
    if (!bezig) return;
    setStap(0);
    const t = setInterval(() => setStap((s) => Math.min(s + 1, STAPPEN.length - 1)), 2500);
    return () => clearInterval(t);
  }, [bezig]);

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (bedrijf.trim().length < 2) return setFout({ tekst: "Vul de naam van je bedrijf in.", veld: "bedrijf" });
    if (aanbod.trim().length < 5) return setFout({ tekst: "Vertel in een of twee zinnen wat je aanbiedt.", veld: "aanbod" });
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/advertentie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bedrijf, aanbod, plaats, boodschap, contact, kleur, website2: lokveld }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.id !== "string") {
        const veld = data?.error?.details?.veld;
        setFout({ tekst: data?.error?.message ?? "Het maken is niet gelukt. Probeer het opnieuw.", ...(veld === "bedrijf" || veld === "aanbod" ? { veld } : {}) });
        setBezig(false);
        return;
      }
      router.push(`/advertentie-op-maat/${data.id}`);
    } catch {
      setFout({ tekst: "Geen verbinding. Probeer het opnieuw." });
      setBezig(false);
    }
  }

  return (
    <form onSubmit={verstuur} noValidate className="rounded-3xl bg-white p-5 text-ink shadow-e2 sm:p-7" aria-labelledby="adv-form-kop">
      <h2 id="adv-form-kop" className="font-display text-xl font-bold text-ink">
        Maak je advertentie
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">Vul in wat je weet. Je ziet meteen drie ontwerpen.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="adv-bedrijf" className="field-label">
            Naam van je bedrijf
          </label>
          <input id="adv-bedrijf" className="field-input" value={bedrijf} onChange={(e) => setBedrijf(e.target.value)} maxLength={GRENS.bedrijf} autoComplete="organization" required aria-invalid={fout?.veld === "bedrijf"} aria-describedby={fout?.veld === "bedrijf" ? "adv-fout" : undefined} disabled={bezig} />
        </div>
        <div>
          <label htmlFor="adv-aanbod" className="field-label">
            Wat bied je aan?
          </label>
          <textarea id="adv-aanbod" className="field-input min-h-[5.5rem] resize-y" value={aanbod} onChange={(e) => setAanbod(e.target.value)} maxLength={GRENS.aanbod} placeholder="Bijvoorbeeld: wij repareren en onderhouden stadsfietsen en e-bikes." required aria-invalid={fout?.veld === "aanbod"} aria-describedby={fout?.veld === "aanbod" ? "adv-fout" : "adv-aanbod-hulp"} disabled={bezig} />
          <p id="adv-aanbod-hulp" className="mt-1 text-xs text-neutralx-500">
            Een of twee zinnen is genoeg.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="adv-plaats" className="field-label">
              Plaats <span className="font-normal text-neutralx-500">(mag leeg)</span>
            </label>
            <input id="adv-plaats" className="field-input" value={plaats} onChange={(e) => setPlaats(e.target.value)} maxLength={GRENS.plaats} autoComplete="address-level2" disabled={bezig} />
          </div>
          <div>
            <label htmlFor="adv-contact" className="field-label">
              Website of telefoon <span className="font-normal text-neutralx-500">(mag leeg)</span>
            </label>
            <input id="adv-contact" className="field-input" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={GRENS.contact} autoCapitalize="none" disabled={bezig} />
          </div>
        </div>
        <div>
          <label htmlFor="adv-boodschap" className="field-label">
            Actie of boodschap <span className="font-normal text-neutralx-500">(mag leeg)</span>
          </label>
          <input id="adv-boodschap" className="field-input" value={boodschap} onChange={(e) => setBoodschap(e.target.value)} maxLength={GRENS.boodschap} placeholder="Bijvoorbeeld: nu ook open op zondag" disabled={bezig} />
        </div>
        {/* lokveld: een mens ziet het niet en laat het leeg */}
        <div className="hidden" aria-hidden>
          <label htmlFor="adv-website2">Laat dit veld leeg</label>
          <input id="adv-website2" tabIndex={-1} autoComplete="off" value={lokveld} onChange={(e) => setLokveld(e.target.value)} />
        </div>
        <fieldset>
          <legend className="field-label">Kleur</legend>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {KLEUREN.map((k) => (
              <label key={k.id} className="relative cursor-pointer">
                <input type="radio" name="adv-kleur" value={k.id} checked={kleur === k.id} onChange={() => setKleur(k.id)} className="peer sr-only" disabled={bezig} />
                <span className="block h-10 w-10 rounded-full border-2 border-white shadow-sm ring-2 ring-hair transition peer-checked:ring-[3px] peer-checked:ring-ink peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand-500" style={{ background: k.hex }} aria-hidden />
                <span className="sr-only">{k.naam}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {fout && !bezig && (
        <p id="adv-fout" role="alert" className="mt-4 rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout.tekst}
        </p>
      )}
      {bezig && (
        <div role="status" aria-live="polite" className="mt-4 rounded-xl bg-paper-soft px-4 py-3">
          <p className="text-sm font-medium text-ink">{STAPPEN[stap]}…</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hair">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${Math.round(((stap + 1) / STAPPEN.length) * 100)}%` }} />
          </div>
        </div>
      )}

      <button type="submit" disabled={bezig} className="btn-primary mt-5 w-full justify-center px-6 py-3 text-base disabled:opacity-60">
        {bezig ? "Bezig…" : "Laat mijn advertentie zien"}
      </button>
      <p className="mt-3 text-center text-xs text-neutralx-500">Geen account, geen e-mailadres nodig. Je betaalt pas als je hem wilt hebben.</p>
    </form>
  );
}
