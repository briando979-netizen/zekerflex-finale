"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// De instellingen van de meldingen naar de telefoon (Admin, Automatisch gedaan). Het nummer staat hier en nergens in de code.

export function MelderInstellingen({ aan, telefoon, whatsapp, brugVerbonden }: { aan: boolean; telefoon: string; whatsapp: boolean; brugVerbonden: boolean }) {
  const router = useRouter();
  const [vAan, setVAan] = useState(aan);
  const [vTelefoon, setVTelefoon] = useState(telefoon);
  const [vWhatsapp, setVWhatsapp] = useState(whatsapp);
  const [bezig, setBezig] = useState<"opslaan" | "test" | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string | null>(null);

  async function opslaan() {
    setBezig("opslaan");
    setFout(null);
    setBericht(null);
    try {
      const res = await fetch("/api/admin/melder", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aan: vAan, telefoon: vTelefoon, whatsapp: vWhatsapp }) });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setFout(data.error?.message ?? "Opslaan is niet gelukt.");
        return;
      }
      setBericht("Opgeslagen.");
      router.refresh();
    } catch {
      setFout("Opslaan is niet gelukt. Probeer het zo opnieuw.");
    } finally {
      setBezig(null);
    }
  }

  async function testen() {
    setBezig("test");
    setFout(null);
    setBericht(null);
    try {
      const res = await fetch("/api/admin/melder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "test" }) });
      const data = (await res.json().catch(() => ({}))) as { kanaal?: string | null; error?: { message?: string } };
      if (!res.ok) setFout(data.error?.message ?? "Het testbericht is niet gelukt.");
      else if (data.kanaal === "whatsapp") setBericht("Testbericht verstuurd via WhatsApp. Kijk op je telefoon.");
      else if (data.kanaal === "push") setBericht("Testbericht verstuurd als melding op je telefoon of computer.");
      else setFout("Het testbericht kwam nergens aan. Sla eerst op, en koppel WhatsApp of zet meldingen aan in de app.");
    } catch {
      setFout("Het testbericht is niet gelukt. Probeer het zo opnieuw.");
    } finally {
      setBezig(null);
    }
  }

  const veld = "w-full rounded-lg border px-3 py-2 text-sm";
  const veldStijl = { borderColor: "var(--a-border)", background: "var(--a-panel)", color: "var(--a-text)" } as const;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <label className="flex items-start gap-3 text-sm" style={{ color: "var(--a-text)" }}>
        <input type="checkbox" checked={vAan} onChange={(e) => setVAan(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          Meldingen aan
          <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
            Belangrijke dingen direct, de rest één keer per uur (tussen 07:00 en 23:00). Het logboek hieronder houdt altijd alles bij.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="melder-telefoon" className="mb-1 block text-sm font-medium" style={{ color: "var(--a-text)" }}>
          Telefoonnummer voor WhatsApp
        </label>
        <input id="melder-telefoon" inputMode="tel" autoComplete="off" value={vTelefoon} onChange={(e) => setVTelefoon(e.target.value)} placeholder="06 12 34 56 78" className={veld} style={veldStijl} />
      </div>

      <label className="flex items-start gap-3 text-sm" style={{ color: "var(--a-text)" }}>
        <input type="checkbox" checked={vWhatsapp} onChange={(e) => setVWhatsapp(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          Ook via WhatsApp sturen
          <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
            {brugVerbonden
              ? "WhatsApp is gekoppeld. De berichten komen bij jezelf binnen."
              : "WhatsApp is nog niet gekoppeld: scan eerst de code bij Admin, WhatsApp. Tot die tijd komen de meldingen als melding in de app."}
          </span>
        </span>
      </label>

      {fout && (
        <p role="alert" className="text-sm font-medium" style={{ color: "var(--a-bad, #b91c1c)" }}>
          {fout}
        </p>
      )}
      {bericht && (
        <p role="status" className="text-sm font-medium" style={{ color: "var(--a-ok)" }}>
          {bericht}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void opslaan()} disabled={bezig !== null} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--a-text)", color: "var(--a-panel)" }}>
          {bezig === "opslaan" ? "Opslaan…" : "Opslaan"}
        </button>
        <button type="button" onClick={() => void testen()} disabled={bezig !== null} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ borderColor: "var(--a-border)", color: "var(--a-text)" }}>
          {bezig === "test" ? "Versturen…" : "Stuur een testbericht"}
        </button>
      </div>
    </div>
  );
}
