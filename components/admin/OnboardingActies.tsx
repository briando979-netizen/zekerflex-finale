"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Knoppen voor één account in Admin → Onboarding (tabel en gebruikersdetail). Elke actie vraagt
// eerst bevestiging, loopt via een eigen beheer-API en komt in het auditspoor.

interface Props {
  userId: string;
  emailBevestigd: boolean;
  /** Werkgever met een bedrijf dat nog niet geverifieerd is. */
  bedrijfId?: string | null;
  /** Hoeft niet meer: alles klaar. */
  klaar?: boolean;
  compact?: boolean;
}

export function OnboardingActies({ userId, emailBevestigd, bedrijfId = null, klaar = false, compact = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tekst: string; fout: boolean } | null>(null);

  async function run(url: string, body: unknown, goed: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string | { message?: string } };
      if (res.ok) {
        setMsg({ tekst: goed, fout: false });
        router.refresh();
      } else {
        const fout = typeof data.error === "string" ? data.error : data.error?.message;
        setMsg({ tekst: data.message ?? fout ?? "Het is niet gelukt.", fout: true });
      }
    } catch {
      setMsg({ tekst: "Geen verbinding. Probeer het opnieuw.", fout: true });
    } finally {
      setBusy(false);
    }
  }

  const verificatiemail = () => {
    if (!window.confirm("De verificatiemail (link en code) opnieuw naar dit account sturen?")) return;
    void run(`/api/admin/onboarding/${userId}/verificatiemail`, {}, "Verificatiemail verstuurd.");
  };

  const markeer = () => {
    const reden = window.prompt("E-mailadres met de hand op bevestigd zetten. Waarom? (minstens 5 tekens, komt in het auditspoor)");
    if (reden === null) return;
    if (reden.trim().length < 5) {
      setMsg({ tekst: "Geef een reden van minstens 5 tekens.", fout: true });
      return;
    }
    void run(`/api/admin/onboarding/${userId}/email-bevestigen`, { reason: reden.trim() }, "E-mailadres staat nu op bevestigd.");
  };

  const herinnering = () => {
    if (!window.confirm("Nu een herinnering sturen om het account af te maken?")) return;
    void run(`/api/admin/onboarding/${userId}/herinnering`, {}, "Herinnering verstuurd.");
  };

  const keurGoed = () => {
    if (!bedrijfId) return;
    if (!window.confirm("Dit bedrijf met de hand goedkeuren? Het kan dan klussen plaatsen en mensen inplannen.")) return;
    void run(`/api/admin/bedrijven/${bedrijfId}/verifieer`, { approved: true }, "Bedrijf goedgekeurd.");
  };

  const klas = compact ? "a-button !px-2 !py-1 text-[0.6875rem]" : "a-button text-xs";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!emailBevestigd && (
        <button type="button" className={klas} disabled={busy} onClick={verificatiemail}>
          Verificatiemail opnieuw
        </button>
      )}
      {!emailBevestigd && (
        <button type="button" className={klas} disabled={busy} onClick={markeer}>
          Markeer als bevestigd
        </button>
      )}
      {!klaar && (
        <button type="button" className={klas} disabled={busy} onClick={herinnering}>
          Herinnering nu
        </button>
      )}
      {bedrijfId && (
        <button type="button" className={klas} disabled={busy} onClick={keurGoed}>
          Bedrijf goedkeuren
        </button>
      )}
      {msg && (
        <span role={msg.fout ? "alert" : "status"} className="text-xs" style={{ color: msg.fout ? "var(--a-crit)" : "var(--a-dim)" }}>
          {msg.tekst}
        </span>
      )}
    </div>
  );
}
