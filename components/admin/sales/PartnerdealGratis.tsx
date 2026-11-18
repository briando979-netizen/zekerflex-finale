"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const KNOP = "rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50";

export interface GratisRij {
  tenantId: string;
  bedrijf: string;
  /** "t/m 17 december 2026", al opgemaakt op de server (Nederlandse tijd) */
  tot: string;
  loopt: boolean;
}

/** Beheer → Sales → campagne → "De gratis maand": een bedrijf dat ja zei 30 dagen geen platformkosten geven. */
export function PartnerdealGratis({ rijen, dagen }: { rijen: GratisRij[]; dagen: number }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [gelukt, setGelukt] = useState("");

  async function geef(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    setGelukt("");
    try {
      const res = await fetch("/api/admin/partnerdeal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = (await res.json().catch(() => null)) as { gegeven?: { nieuw: boolean; bedrijf: string }[]; error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message || "Dat lukte niet. Probeer het opnieuw.");
      const eerste = data?.gegeven?.[0];
      setGelukt(eerste ? (eerste.nieuw ? `${eerste.bedrijf} betaalt nu ${dagen} dagen geen platformkosten.` : `${eerste.bedrijf} had de gratis maand al; er is niets veranderd.`) : "Klaar.");
      setEmail("");
      router.refresh();
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void geef(e)} className="flex flex-wrap items-end gap-2">
        <label className="min-w-[16rem] flex-1 text-xs" style={{ color: "var(--a-dim)" }}>
          E-mailadres waarmee het bedrijf zich heeft aangemeld
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="naam@bedrijf.nl"
            className="mt-1 block w-full rounded-md px-3 py-2 text-[0.8125rem]"
            style={{ background: "var(--a-panel-2)", color: "var(--a-text)", border: "1px solid var(--a-border-strong)" }}
          />
        </label>
        <button type="submit" disabled={bezig || !email} className={KNOP} style={{ color: "var(--a-panel)", background: "var(--a-text)" }}>
          {bezig ? "Bezig…" : `Geef ${dagen} dagen geen platformkosten`}
        </button>
      </form>
      {fout ? (
        <p role="alert" className="text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
          {fout}
        </p>
      ) : null}
      {gelukt ? (
        <p role="status" className="text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
          {gelukt}
        </p>
      ) : null}
      {rijen.length ? (
        <ul>
          {rijen.map((r) => (
            <li key={r.tenantId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[0.8125rem]" style={{ borderTop: "1px solid var(--a-border)", color: "var(--a-text)" }}>
              <span>{r.bedrijf}</span>
              <span style={{ color: "var(--a-mute)" }}>{r.loopt ? `geen platformkosten ${r.tot}` : `gratis maand voorbij (${r.tot})`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
          Nog geen bedrijf heeft de gratis maand gekregen.
        </p>
      )}
    </div>
  );
}
