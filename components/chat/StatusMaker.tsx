"use client";

import { useEffect, useState } from "react";
import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import { STATUS_FOTO_TYPES, STATUS_KLEUREN, STATUS_TEKST_MAX, statusKleur } from "@/lib/messaging/status-vorm";

// Een status plaatsen (15 nov 2026): een tekst op een gekleurde achtergrond, of een foto met een bijschrift. De server
// slaat een foto opnieuw op zonder GPS en andere gegevens (cleanPhoto) en toont hem 24 uur aan je contacten.

export function StatusMaker({ onKlaar, onCancel }: { onKlaar: () => void; onCancel: () => void }) {
  const t = useChatTeksten().inbox;
  const [soort, setSoort] = useState<"tekst" | "foto">("tekst");
  const [tekst, setTekst] = useState("");
  const [kleur, setKleur] = useState(0);
  const [foto, setFoto] = useState<File | null>(null);
  const [voorbeeld, setVoorbeeld] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    if (!foto) {
      setVoorbeeld(null);
      return;
    }
    const url = URL.createObjectURL(foto);
    setVoorbeeld(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const plaats = async () => {
    setFout(null);
    if (soort === "tekst" && !tekst.trim()) return setFout(t.statusTekstNodig);
    if (soort === "foto" && !foto) return setFout(t.statusFotoNodig);
    setBezig(true);
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (soort === "foto" && foto) {
      const form = new FormData();
      form.append("file", foto);
      if (tekst.trim()) form.append("tekst", tekst.trim());
      body = form;
    } else {
      body = JSON.stringify({ tekst: tekst.trim(), kleur });
      headers["Content-Type"] = "application/json";
    }
    const r = await fetch("/api/inbox/status", { method: "POST", headers, body }).catch(() => null);
    setBezig(false);
    if (r?.ok) return onKlaar();
    const d = r ? await r.json().catch(() => ({})) : {};
    setFout(d?.error?.message ?? (r ? t.datLukteNietOpnieuw : t.geenVerbindingOpnieuw));
  };

  const tab = (s: "tekst" | "foto", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={soort === s}
      onClick={() => {
        setSoort(s);
        setFout(null);
      }}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${soort === s ? "bg-brand-50 text-brand-700" : "text-neutralx-500 hover:bg-paper-soft"}`}
    >
      {label}
    </button>
  );

  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
        <div role="dialog" aria-modal="true" aria-label={t.statusToevoegen} className="chat-surface w-full rounded-t-2xl bg-white p-4 shadow-lift sm:max-w-sm sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="mb-2 font-display text-sm font-bold text-ink">{t.statusToevoegen}</p>
          <div className="mb-3 flex gap-1" role="tablist">
            {tab("tekst", t.statusTekst)}
            {tab("foto", t.statusFoto)}
          </div>
          {soort === "tekst" ? (
            <>
              <textarea
                value={tekst}
                onChange={(e) => setTekst(e.target.value)}
                maxLength={STATUS_TEKST_MAX}
                rows={4}
                aria-label={t.statusTekstPlaceholder}
                placeholder={t.statusTekstPlaceholder}
                className="w-full resize-none rounded-xl p-4 text-center text-lg font-semibold text-white placeholder:text-white/70"
                style={{ backgroundColor: statusKleur(kleur) }}
                autoFocus
              />
              <div className="mt-2 flex items-center gap-2" role="radiogroup" aria-label={t.statusKleur}>
                {STATUS_KLEUREN.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={kleur === i}
                    aria-label={`${t.statusKleur} ${i + 1}`}
                    onClick={() => setKleur(i)}
                    className={`h-7 w-7 rounded-full ring-offset-2 ${kleur === i ? "ring-2 ring-brand-500" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <label className="block">
                <span className="field-label">{t.statusFotoKiezen}</span>
                <input type="file" accept={STATUS_FOTO_TYPES.join(",")} onChange={(e) => setFoto(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
              </label>
              {voorbeeld && (
                // eslint-disable-next-line @next/next/no-img-element -- voorbeeld van een gekozen bestand (blob)
                <img src={voorbeeld} alt="" className="mt-2 max-h-56 w-full rounded-xl object-contain" />
              )}
              <label className="mt-2 block">
                <span className="field-label">{t.statusBijschrift}</span>
                <input value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={STATUS_TEKST_MAX} className="field-input mt-1 w-full" />
              </label>
            </>
          )}
          <p className="mt-2 text-[11px] text-neutralx-500">{t.statusUitleg}</p>
          {fout && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-crit">
              {fout}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={bezig} onClick={() => void plaats()} className="btn-primary flex-1 text-sm disabled:opacity-60">
              {t.statusPlaatsen}
            </button>
            <button type="button" onClick={onCancel} className="rounded-lg px-3 text-sm text-neutralx-500 hover:bg-paper-soft">
              {t.statusSluiten}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
