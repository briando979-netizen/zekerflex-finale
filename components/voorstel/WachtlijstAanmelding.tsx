"use client";

import { useState, type KeyboardEvent } from "react";

// "Is jouw tijd vol? Zet je op de wachtlijst." Onder de tijden van een dag
// met volle tijdsloten. Er gaat geen mail uit: komt er plek vrij, dan ziet de
// gast dat in Mijn account en ziet het team het in het beheer (en belt).
// Geen eigen <form>: de agenda is zelf al één formulier, en een genest
// formulier zou ook de boeking versturen. Enter hier meldt alleen hier aan.

const VELD = "mt-1 w-full rounded-2xl border-0 bg-white px-4 py-3 text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";

export function WachtlijstAanmelding({
  activiteit,
  naam,
  datum,
  personen,
  volleTijden,
  bekend,
}: {
  activiteit: string;
  naam: string;
  datum: string;
  personen: number;
  volleTijden: string[];
  bekend: { naam: string; email: string; telefoon: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [tijd, setTijd] = useState(volleTijden[0] ?? "");
  const [gegevens, setGegevens] = useState({ naam: bekend?.naam ?? "", email: bekend?.email ?? "", telefoon: bekend?.telefoon ?? "" });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [klaar, setKlaar] = useState("");

  async function meldAan() {
    if (gegevens.naam.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(gegevens.email.trim()) || gegevens.telefoon.trim().length < 6) {
      setFout("Vul je naam, e-mailadres en telefoonnummer in.");
      return;
    }
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/api/voorstel/schwarzwald/wachtlijst", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activiteit, datum, tijd, personen, ...gegevens }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Aanmelden is niet gelukt.");
      setKlaar(tijd);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Aanmelden is niet gelukt.");
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    return (
      <p role="status" className="mt-5 rounded-2xl bg-schw-sand p-4 text-sm">
        <strong>Je staat op de wachtlijst</strong> voor {naam} om {klaar} uur. Komt er plek vrij, dan neemt Het Schwarzwald contact met je op
        {bekend ? "; je ziet het ook meteen in Mijn account" : ""}.
      </p>
    );
  }
  if (!open) {
    return (
      <p className="mt-5 text-sm">
        Is jouw tijd vol?{" "}
        <button type="button" onClick={() => setOpen(true)} className="font-semibold underline underline-offset-4">
          Zet je op de wachtlijst
        </button>
      </p>
    );
  }
  const enter = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      void meldAan();
    }
  };

  return (
    <div role="group" aria-label="Wachtlijst" onKeyDown={enter} className="mt-5 space-y-3 rounded-2xl bg-schw-sand p-4">
      <p className="font-semibold">Op de wachtlijst voor {naam}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Tijd
          <select value={tijd} onChange={(e) => setTijd(e.target.value)} className={VELD}>
            {volleTijden.map((t) => (
              <option key={t} value={t}>
                {t} uur ({personen} personen)
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Je naam
          <input aria-required="true" autoComplete="name" value={gegevens.naam} onChange={(e) => setGegevens({ ...gegevens, naam: e.target.value })} className={VELD} />
        </label>
        <label className="block text-sm font-semibold">
          E-mailadres
          <input aria-required="true" type="email" autoComplete="email" value={gegevens.email} onChange={(e) => setGegevens({ ...gegevens, email: e.target.value })} className={VELD} />
        </label>
        <label className="block text-sm font-semibold">
          Telefoonnummer
          <input aria-required="true" type="tel" autoComplete="tel" value={gegevens.telefoon} onChange={(e) => setGegevens({ ...gegevens, telefoon: e.target.value })} className={VELD} />
        </label>
      </div>
      {fout && (
        <p role="alert" className="rounded-xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {fout}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void meldAan()} disabled={bezig || !tijd} className="rounded-full bg-schw-night px-5 py-2.5 text-sm font-bold text-schw-cream disabled:opacity-50">
          {bezig ? "Bezig…" : "Zet me op de wachtlijst"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-schw-night/15">
          Annuleren
        </button>
      </div>
      <p className="text-xs text-schw-mute">We gebruiken je gegevens alleen om je te bellen of mailen als er plek vrijkomt. Na de datum vervalt je aanmelding vanzelf.</p>
    </div>
  );
}
