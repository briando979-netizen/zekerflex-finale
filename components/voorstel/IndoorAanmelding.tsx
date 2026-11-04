"use client";

import { useState, type FormEvent } from "react";
import { INTERESSES, INTERESSE_LABEL, type Interesse } from "@/lib/voorstel/indoor-regels";

// "Houd me op de hoogte" voor het nieuwe indoor megacenter, in plaats van een
// mailto-link: een echte interesselijst die Het Schwarzwald in het beheer ziet
// en bij de opening exporteert. Staat op een donkere achtergrond.

const VELD = "mt-1 w-full rounded-2xl border-0 bg-schw-cream px-4 py-3 text-schw-night ring-1 ring-white/20 focus:outline-none focus:ring-2 focus:ring-schw-orange";

export function IndoorAanmelding({ contactEmail }: { contactEmail: string }) {
  const [email, setEmail] = useState("");
  const [naam, setNaam] = useState("");
  const [groep, setGroep] = useState("");
  const [interesses, setInteresses] = useState<Interesse[]>([]);
  const [toestemming, setToestemming] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [klaar, setKlaar] = useState<"nieuw" | "bijgewerkt" | "">("");

  const wissel = (i: Interesse) => setInteresses((oud) => (oud.includes(i) ? oud.filter((x) => x !== i) : [...oud, i]));

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFout("Vul een geldig e-mailadres in.");
      return;
    }
    if (!toestemming) {
      setFout("Geef toestemming dat Het Schwarzwald je hierover mag mailen.");
      return;
    }
    const aantal = Number(groep);
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/voorstel/schwarzwald/indoor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          naam,
          interesses,
          ...(groep && Number.isInteger(aantal) && aantal > 0 ? { groep: aantal } : {}),
          toestemming: true,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { nieuw?: boolean; error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Aanmelden is niet gelukt.");
      setKlaar(d.nieuw === false ? "bijgewerkt" : "nieuw");
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Aanmelden is niet gelukt.");
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    return (
      <p role="status" className="mt-8 max-w-xl rounded-2xl bg-white/10 p-5 text-schw-cream ring-1 ring-white/15">
        <strong className="text-schw-sun">{klaar === "nieuw" ? "Je staat op de lijst!" : "Je aanmelding is bijgewerkt."}</strong> Zodra de deuren van het indoor centrum opengaan, hoor je het als
        een van de eersten.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void verstuur(e)} noValidate className="mt-8 max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          E-mailadres
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={VELD} />
        </label>
        <label className="block text-sm font-semibold">
          Voornaam <span className="font-normal text-schw-cream/70">(mag leeg)</span>
          <input autoComplete="given-name" value={naam} onChange={(e) => setNaam(e.target.value)} className={VELD} />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Waar ben je benieuwd naar?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {INTERESSES.map((i) => (
            <label
              key={i}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-schw-orange ${
                interesses.includes(i) ? "bg-schw-sun text-schw-night ring-schw-sun" : "text-schw-cream ring-white/25 hover:bg-white/10"
              }`}
            >
              <input type="checkbox" className="sr-only" checked={interesses.includes(i)} onChange={() => wissel(i)} />
              {INTERESSE_LABEL[i]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block max-w-[14rem] text-sm font-semibold">
        Met hoeveel personen ongeveer? <span className="font-normal text-schw-cream/70">(mag leeg)</span>
        <input type="number" inputMode="numeric" min={1} max={500} value={groep} onChange={(e) => setGroep(e.target.value)} className={VELD} />
      </label>
      <label className="flex items-start gap-3 text-sm text-schw-cream/90">
        <input type="checkbox" required checked={toestemming} onChange={(e) => setToestemming(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-schw-orange" />
        <span>Ja, Het Schwarzwald mag me mailen over de opening van het indoor centrum.</span>
      </label>
      {fout && (
        <p role="alert" className="rounded-xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {fout}
        </p>
      )}
      <button
        type="submit"
        disabled={bezig}
        className="rounded-full bg-schw-cream px-7 py-4 font-bold text-schw-night transition-transform hover:-translate-y-0.5 disabled:opacity-60"
      >
        {bezig ? "Bezig…" : "Houd me op de hoogte"}
      </button>
      <p className="text-xs text-schw-cream/70">
        We gebruiken je gegevens alleen voor berichten over het indoor centrum. Je aanmelding vervalt na 18 maanden vanzelf; afmelden kan altijd via{" "}
        <a href={`mailto:${contactEmail}?subject=${encodeURIComponent("Afmelden interesselijst indoor centrum")}`} className="underline underline-offset-2">
          {contactEmail}
        </a>
        .
      </p>
    </form>
  );
}
