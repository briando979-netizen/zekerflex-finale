"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ACTIVITEITEN, BASE, CONTACT, DOELGROEPEN, THEMAFEESTEN } from "@/lib/voorstel/schwarzwald";
import type { EtenInvulling } from "@/lib/voorstel/eten-regels";

// Aanvraagformulier voor themafeesten, bruiloften en grote groepen. De
// aanvraag komt als lead in het CRM van Het Schwarzwald (Beheer → Aanvragen);
// ingelogd zie je hem terug onder Mijn account. Via "Blijf je eten?" na een
// reservering komt het alvast ingevuld binnen (invulling).

const VELD = "mt-1.5 w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";
const LABEL = "text-sm font-semibold text-schw-night";

export function ReserveerAanvraag({
  activiteit = "",
  thema = "",
  voor = "",
  gegevens = null,
  invulling = null,
}: {
  activiteit?: string;
  thema?: string;
  voor?: string;
  gegevens?: { naam: string; email: string; telefoon: string } | null;
  invulling?: EtenInvulling | null;
}) {
  const [programma, setProgramma] = useState(activiteit ? `a:${activiteit}` : thema ? `t:${thema}` : "");
  const [gelegenheid, setGelegenheid] = useState(voor);
  const [datum, setDatum] = useState(invulling?.datum ?? "");
  const [aantal, setAantal] = useState(invulling?.aantal ?? "");
  const [naam, setNaam] = useState(gegevens?.naam ?? "");
  const [email, setEmail] = useState(gegevens?.email ?? "");
  const [telefoon, setTelefoon] = useState(gegevens?.telefoon ?? "");
  const [bericht, setBericht] = useState(invulling?.bericht ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [klaar, setKlaar] = useState(false);

  const programmaNaam = ACTIVITEITEN.find((a) => `a:${a.slug}` === programma)?.naam ?? THEMAFEESTEN.find((t) => `t:${t.slug}` === programma)?.naam ?? "";
  const gelegenheidNaam = DOELGROEPEN.find((d) => d.slug === gelegenheid)?.naam ?? "";

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/voorstel/schwarzwald/aanvraag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ naam, email, telefoon, gelegenheid: gelegenheidNaam, programma: programmaNaam, datum, personen: Number(aantal), bericht }),
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
      <div id="aanvraag" role="status" className="scroll-mt-28 rounded-xl3 bg-schw-sand p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-rust">Ontvangen</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Dank je, {naam.split(" ")[0]}!</h2>
        <p className="mt-3 text-schw-night/80">
          We hebben je aanvraag voor {aantal} personen ontvangen en nemen snel contact op met een voorstel op maat.
          {gegevens ? (
            <>
              {" "}
              Je ziet de status onder <Link href={`${BASE}/account`} className="font-semibold underline">Mijn account</Link>.
            </>
          ) : null}
        </p>
        <p className="mt-3 text-sm text-schw-mute">Liever direct even bellen? {CONTACT.telefoon}</p>
      </div>
    );
  }

  return (
    <form id="aanvraag" onSubmit={(e) => void verstuur(e)} className="scroll-mt-28 rounded-xl3 bg-schw-sand p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold">Vraag een voorstel aan</h2>
      <p className="mt-1 text-schw-mute">Vertel wat jullie zoeken, dan stellen wij een programma op maat voor.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={LABEL}>Wat willen jullie doen?</span>
          <select value={programma} onChange={(e) => setProgramma(e.target.value)} className={VELD}>
            <option value="">Weet ik nog niet, adviseer ons</option>
            <optgroup label="Activiteiten">
              {ACTIVITEITEN.map((a) => (
                <option key={a.slug} value={`a:${a.slug}`}>
                  {a.naam}
                </option>
              ))}
            </optgroup>
            <optgroup label="Themafeesten">
              {THEMAFEESTEN.map((t) => (
                <option key={t.slug} value={`t:${t.slug}`}>
                  {t.naam}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Gelegenheid</span>
          <select value={gelegenheid} onChange={(e) => setGelegenheid(e.target.value)} className={VELD}>
            <option value="">Anders</option>
            {DOELGROEPEN.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.naam}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Aantal personen</span>
          <input type="number" inputMode="numeric" min={2} max={1000} required value={aantal} onChange={(e) => setAantal(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Datum (mag ook later)</span>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Je naam</span>
          <input type="text" autoComplete="name" required value={naam} onChange={(e) => setNaam(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>E-mailadres</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Telefoonnummer</span>
          <input type="tel" autoComplete="tel" required value={telefoon} onChange={(e) => setTelefoon(e.target.value)} className={VELD} />
        </label>
        <label className="block sm:col-span-2">
          <span className={LABEL}>Wensen of vragen (mag leeg)</span>
          <textarea rows={3} value={bericht} onChange={(e) => setBericht(e.target.value)} placeholder="Bijvoorbeeld: met diner, een DJ, of rekening houden met allergieën." className={VELD} />
        </label>
      </div>
      {fout && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {fout}
        </p>
      )}
      <button type="submit" disabled={bezig} className="mt-6 w-full rounded-full bg-schw-orange py-4 font-bold text-schw-night transition-transform hover:-translate-y-0.5 disabled:opacity-50">
        {bezig ? "Bezig…" : "Verstuur aanvraag"}
      </button>
    </form>
  );
}
