"use client";

import { useRef, useState } from "react";
import { AUDIO_ACCEPT, AUDIO_TALEN, audioBestandFout, duurTekst, tekstBestandsnaam } from "@/lib/asr/bestand";

/**
 * Admin → Audio naar tekst: kies een opname (een WhatsApp-spraakbericht, een mp3, een filmpje
 * van je telefoon), kies de taal en krijg de tekst terug, om te kopiëren of te downloaden.
 * Het omzetten gebeurt op onze eigen server (Whisper); het bestand wordt nergens bewaard.
 */
export function AudioNaarTekst() {
  const invoer = useRef<HTMLInputElement>(null);
  const [bestand, setBestand] = useState<File | null>(null);
  const [taal, setTaal] = useState<string>("nl");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [tekst, setTekst] = useState<string | null>(null);
  const [duur, setDuur] = useState<number | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  function kies(f: File | null) {
    setTekst(null);
    setDuur(null);
    setGekopieerd(false);
    setFout(f ? audioBestandFout(f.name, f.type, f.size) : null);
    setBestand(f);
  }

  async function zetOm() {
    if (!bestand) return;
    const probleem = audioBestandFout(bestand.name, bestand.type, bestand.size);
    if (probleem) {
      setFout(probleem);
      return;
    }
    setBezig(true);
    setFout(null);
    setTekst(null);
    try {
      const form = new FormData();
      form.append("audio", bestand, bestand.name);
      form.append("taal", taal);
      const res = await fetch("/api/admin/audio-tekst", { method: "POST", body: form });
      const d = (await res.json().catch(() => ({}))) as { tekst?: string; ms?: number; error?: { message?: string } };
      if (!res.ok) {
        setFout(d.error?.message ?? "Omzetten lukte niet. Probeer het opnieuw.");
        return;
      }
      setTekst(d.tekst ?? "");
      setDuur(d.ms ?? null);
    } catch {
      setFout("Geen verbinding met de server. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  async function kopieer() {
    if (!tekst) return;
    try {
      await navigator.clipboard.writeText(tekst);
      setGekopieerd(true);
    } catch {
      setFout("Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.");
    }
  }

  function download() {
    if (tekst === null || !bestand) return;
    const url = URL.createObjectURL(new Blob([tekst], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = tekstBestandsnaam(bestand.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="a-label min-w-[16rem] flex-1">
          Opname
          <input
            ref={invoer}
            type="file"
            accept={AUDIO_ACCEPT}
            className="a-input"
            onChange={(e) => kies(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="a-label">
          Taal van de opname
          <select className="a-input" value={taal} onChange={(e) => setTaal(e.target.value)}>
            {AUDIO_TALEN.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!bestand || bezig || Boolean(bestand && audioBestandFout(bestand.name, bestand.type, bestand.size))} onClick={() => void zetOm()} className="a-btn a-btn-primary disabled:opacity-50">
          {bezig ? "Bezig met omzetten…" : "Omzetten naar tekst"}
        </button>
      </div>

      {bezig && (
        <p role="status" className="text-sm" style={{ color: "var(--a-mute)" }}>
          Onze eigen spraakherkenning luistert mee. Een spraakbericht duurt een paar seconden, een opname van een uur ongeveer een kwartier. Laat deze pagina open.
        </p>
      )}
      {fout && (
        <p role="alert" className="text-sm" style={{ color: "var(--a-crit, #b42318)" }}>
          {fout}
        </p>
      )}

      {tekst !== null && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
              Tekst{duur !== null ? ` (omgezet in ${duurTekst(duur)})` : ""}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void kopieer()} className="a-btn a-btn-ghost">
                {gekopieerd ? "Gekopieerd" : "Kopieer"}
              </button>
              <button type="button" onClick={download} className="a-btn a-btn-ghost">
                Download als tekstbestand
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={tekst || "Er is geen spraak gevonden in deze opname."}
            rows={Math.min(18, Math.max(5, Math.ceil((tekst || "").length / 90)))}
            aria-label="Uitgeschreven tekst"
            className="a-input w-full font-[inherit] leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
