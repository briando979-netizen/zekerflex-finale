"use client";

import { useEffect, useState } from "react";

interface Stand {
  ingesteld: boolean;
  adres: string | null;
  bron: "beheer" | "omgeving" | null;
}

/**
 * Beheer → Mail: de verkoopmailbox (21 nov 2026, lib/mail/verkoop-mailbox.ts). Verkoopmail gaat alleen via deze eigen mailbox,
 * zodat hij nooit meer de dagelijkse grens van de gewone mailbox opmaakt (dan kwamen inlogcodes niet meer aan). Het wachtwoord
 * typ je hier zelf; het wordt pas bewaard als TransIP de login aanneemt, en het komt nooit meer terug op het scherm.
 */
export function VerkoopMailbox() {
  const [stand, setStand] = useState<Stand | null>(null);
  // 21 nov: het pakket van TransIP zit vol (3/3); gratis is de ongebruikte mailbox uitzendbureau@ (afzender blijft sales@)
  const [adres, setAdres] = useState("uitzendbureau@zekerflex.com");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ fout: boolean; tekst: string } | null>(null);

  useEffect(() => {
    void fetch("/api/admin/mail/verkoop-mailbox")
      .then((r) => r.json())
      .then((d: Stand) => setStand(d))
      .catch(() => setStand(null));
  }, []);

  async function opslaan() {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/mail/verkoop-mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adres, wachtwoord }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Opslaan mislukt.");
      setStand(d as Stand);
      setWachtwoord("");
      setMelding({ fout: false, tekst: "TransIP nam de login aan. Verkoopmail gaat vanaf nu via deze mailbox." });
    } catch (e) {
      setMelding({ fout: true, tekst: (e as Error).message });
    } finally {
      setBezig(false);
    }
  }

  async function wissen() {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/mail/verkoop-mailbox", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Wissen mislukt.");
      setStand(d as Stand);
      setMelding({ fout: false, tekst: "Gewist. Zonder verkoopmailbox wordt er geen verkoopmail verstuurd." });
    } catch (e) {
      setMelding({ fout: true, tekst: (e as Error).message });
    } finally {
      setBezig(false);
    }
  }

  const veld = { background: "var(--a-bg, #0b0b0c)", border: "1px solid var(--a-border)", color: "var(--a-text)" };

  return (
    <div className="mb-4 rounded-xl p-4" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        Verkoopmailbox
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
        Verkoopmail gaat alleen via een eigen mailbox. Zo blijft de mail van de app (inlogcodes, wachtwoord vergeten) altijd werken, ook na
        een grote verkoopronde. Typ hier de mailbox waarmee verkoopmail inlogt (gratis: uitzendbureau@) en het wachtwoord dat je bij TransIP
        zette. Als afzender blijft sales@zekerflex.com staan. Zit info@ aan zijn daggrens, dan gaat ook de mail van de app (inlogcodes,
        wachtwoord vergeten) via deze mailbox.
      </p>
      <p className="mt-2 text-xs" style={{ color: stand?.ingesteld ? "var(--a-ok, #16a34a)" : "var(--a-warn, #d97706)" }}>
        {stand === null
          ? "Laden…"
          : stand.ingesteld
            ? `✓ Ingesteld: ${stand.adres ?? ""}${stand.bron === "omgeving" ? " (via de serverinstellingen)" : ""}`
            : "Nog niet ingesteld: er gaat nu geen verkoopmail de deur uit."}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[13rem] flex-1 flex-col gap-1 text-xs" style={{ color: "var(--a-mute)" }}>
          Adres
          <input
            type="email"
            value={adres}
            onChange={(e) => setAdres(e.target.value)}
            autoComplete="off"
            className="rounded-lg px-3 py-2 text-sm"
            style={veld}
          />
        </label>
        <label className="flex min-w-[13rem] flex-1 flex-col gap-1 text-xs" style={{ color: "var(--a-mute)" }}>
          Wachtwoord van die mailbox
          <input
            type="password"
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            autoComplete="new-password"
            className="rounded-lg px-3 py-2 text-sm"
            style={veld}
          />
        </label>
        <button type="button" disabled={bezig || !adres.trim() || !wachtwoord} onClick={() => void opslaan()} className="a-btn a-btn-primary disabled:opacity-50">
          {bezig ? "Bezig…" : "Testen en opslaan"}
        </button>
        {stand?.bron === "beheer" && (
          <button type="button" disabled={bezig} onClick={() => void wissen()} className="a-btn a-btn-ghost disabled:opacity-50">
            Wissen
          </button>
        )}
      </div>
      {melding && (
        <p role={melding.fout ? "alert" : "status"} className="mt-2 text-xs" style={{ color: melding.fout ? "var(--a-crit, #dc2626)" : "var(--a-mute)" }}>
          {melding.tekst}
        </p>
      )}
    </div>
  );
}
