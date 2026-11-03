"use client";

import { useState, type FormEvent } from "react";
import { CONTACT } from "@/lib/voorstel/schwarzwald";
import { BEWAAR_DAGEN, UREN } from "@/lib/voorstel/sollicitatie-regels";

// Solliciteren op een vacature (of open sollicitatie op /vacatures). De
// sollicitatie komt in het beheer van Het Schwarzwald (tabblad Sollicitaties);
// ingelogd zijn naam, e-mail en telefoon al ingevuld.

const VELD = "mt-1.5 w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";
const LABEL = "text-sm font-semibold text-schw-night";

export function Solliciteren({
  vacature,
  functie,
  gegevens = null,
}: {
  vacature: string;
  functie: string;
  gegevens?: { naam: string; email: string; telefoon: string } | null;
}) {
  const [naam, setNaam] = useState(gegevens?.naam ?? "");
  const [email, setEmail] = useState(gegevens?.email ?? "");
  const [telefoon, setTelefoon] = useState(gegevens?.telefoon ?? "");
  const [uren, setUren] = useState("");
  const [start, setStart] = useState("");
  const [motivatie, setMotivatie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [klaar, setKlaar] = useState(false);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/voorstel/schwarzwald/sollicitatie", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vacature, naam, email, telefoon, uren, start, motivatie }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Versturen is niet gelukt.");
      setKlaar(true);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Versturen is niet gelukt.");
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    return (
      <div id="solliciteren" role="status" className="scroll-mt-28 rounded-xl3 bg-schw-sand p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-rust">Ontvangen</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Dank je, {naam.split(" ")[0]}!</h2>
        <p className="mt-3 text-schw-night/80">
          Je sollicitatie als {functie.toLowerCase()} is binnen. We bekijken hem en nemen contact met je op via {email}.
        </p>
        <p className="mt-3 text-sm text-schw-mute">Vragen over de functie? Bel {CONTACT.telefoon}.</p>
      </div>
    );
  }

  return (
    <form id="solliciteren" onSubmit={(e) => void verstuur(e)} className="scroll-mt-28 rounded-xl3 bg-schw-sand p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-rust">Direct solliciteren</p>
      <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{functie}</h2>
      <p className="mt-1 text-schw-mute">Geen brief nodig: vertel kort wie je bent, dan nemen wij contact op.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Je naam</span>
          <input type="text" name="naam" autoComplete="name" required value={naam} onChange={(e) => setNaam(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>E-mailadres</span>
          <input type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Telefoonnummer</span>
          <input type="tel" name="telefoon" autoComplete="tel" required value={telefoon} onChange={(e) => setTelefoon(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Hoeveel wil je werken?</span>
          <select name="uren" value={uren} onChange={(e) => setUren(e.target.value)} className={VELD}>
            <option value="">Maakt niet uit</option>
            {UREN.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Wanneer kun je beginnen? (mag leeg)</span>
          <input type="date" name="start" value={start} onChange={(e) => setStart(e.target.value)} className={VELD} />
        </label>
        <label className="block sm:col-span-2">
          <span className={LABEL}>Waarom wil je bij Het Schwarzwald werken?</span>
          <textarea
            name="motivatie"
            rows={5}
            required
            minLength={20}
            maxLength={3000}
            value={motivatie}
            onChange={(e) => setMotivatie(e.target.value)}
            placeholder="Bijvoorbeeld je ervaring, wat je leuk vindt aan het werk en wanneer je kunt."
            className={VELD}
          />
        </label>
      </div>
      {fout && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {fout}
        </p>
      )}
      <button type="submit" disabled={bezig} className="mt-6 w-full rounded-full bg-schw-orange py-4 font-bold text-schw-night transition-transform hover:-translate-y-0.5 disabled:opacity-50">
        {bezig ? "Bezig…" : "Verstuur sollicitatie"}
      </button>
      <p className="mt-4 text-xs text-schw-mute">
        We gebruiken je gegevens alleen voor deze sollicitatie en wissen ze uiterlijk {BEWAAR_DAGEN / 7} weken na de laatste stap. Dit is een ontwerpvoorstel voor de nieuwe
        website: solliciteer je echt, mail dan ook naar <a href={`mailto:${CONTACT.email}`} className="underline">{CONTACT.email}</a>.
      </p>
    </form>
  );
}
