import { CONTACT, INTERESSES } from "@/lib/voorstel/smileyapp";

// Het contactformulier van smileyapp.nl, maar dicht zolang dit een
// ontwerpvoorstel is: alle velden staan uit en er is geen formulier-element, dus er kan
// niets verstuurd of bewaard worden. De echte weg staat erboven: mailen.

const VELD =
  "mt-1.5 w-full rounded-2xl border-0 bg-smiley-cream px-4 py-3 text-sm text-smiley-ink ring-1 ring-smiley-ink/15 disabled:cursor-not-allowed disabled:opacity-70";

export function GeslotenFormulier({ id, kop, gekozen, onderwerp }: { id: string; kop: string; gekozen?: string | undefined; onderwerp: string }) {
  const mail = `mailto:${CONTACT.email}?subject=${encodeURIComponent(onderwerp)}`;
  return (
    <section aria-labelledby={`${id}-kop`} className="rounded-[2rem] bg-white p-6 shadow-[0_30px_80px_-40px_rgba(14,42,32,0.45)] ring-1 ring-smiley-ink/10 sm:p-8">
      <h2 id={`${id}-kop`} className="font-display text-2xl font-bold text-smiley-ink sm:text-3xl">
        {kop}
      </h2>
      <p id={`${id}-dicht`} className="mt-4 rounded-2xl bg-smiley-sun/35 p-4 text-sm font-semibold leading-relaxed text-smiley-ink">
        Dit formulier staat dicht zolang dit een ontwerpvoorstel is: er wordt niets verstuurd of bewaard. Mail je vraag naar{" "}
        <a href={mail} className="underline underline-offset-2">
          {CONTACT.email}
        </a>
        .
      </p>
      <fieldset disabled aria-describedby={`${id}-dicht`} className="mt-6 grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Contactformulier (staat dicht in dit voorstel)</legend>
        <label className="block text-sm font-semibold text-smiley-ink">
          Voornaam
          <input type="text" name="voornaam" autoComplete="given-name" className={VELD} />
        </label>
        <label className="block text-sm font-semibold text-smiley-ink">
          Achternaam
          <input type="text" name="achternaam" autoComplete="family-name" className={VELD} />
        </label>
        <label className="block text-sm font-semibold text-smiley-ink">
          E-mailadres
          <input type="email" name="email" autoComplete="email" className={VELD} />
        </label>
        <label className="block text-sm font-semibold text-smiley-ink">
          Telefoonnummer
          <input type="tel" name="telefoon" autoComplete="tel" className={VELD} />
        </label>
        <label className="block text-sm font-semibold text-smiley-ink sm:col-span-2">
          Bedrijfsnaam
          <input type="text" name="bedrijf" autoComplete="organization" className={VELD} />
        </label>
        <label className="block text-sm font-semibold text-smiley-ink sm:col-span-2">
          Ik ben geïnteresseerd in
          <select name="interesse" defaultValue={gekozen ?? ""} className={VELD}>
            <option value="">Maak een keuze</option>
            {INTERESSES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-smiley-ink sm:col-span-2">
          Jouw vraag of opmerking
          <textarea name="vraag" rows={4} className={VELD} />
        </label>
        <div className="sm:col-span-2">
          <button type="button" className="w-full cursor-not-allowed rounded-full bg-smiley-mute px-6 py-3.5 font-bold text-white sm:w-auto">
            Versturen (staat dicht)
          </button>
        </div>
      </fieldset>
      <a href={mail} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-smiley-green px-6 py-3.5 font-bold text-smiley-ink transition-transform hover:-translate-y-0.5 sm:w-auto">
        Mail {CONTACT.email}
      </a>
    </section>
  );
}
