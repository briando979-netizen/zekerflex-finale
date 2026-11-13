"use client";

import { useMemo, useState } from "react";
import { Shell } from "./modals";
import { useChatTeksten } from "./ChatTekstenContext";
import { RONDZEND_MAX, type Kandidaat } from "@/lib/messaging/rondzenden";
import { vulIn } from "@/lib/i18n/vul-in";

// Rondzenden (zoals de verzendlijst van WhatsApp, 13 nov 2026): kies contacten, schrijf één bericht, en ieder krijgt het
// apart in jullie eigen gesprek (POST /api/inbox/rondzenden). Antwoorden blijven in die gesprekken.

export function RondzendModal({ kandidaten, onClose, onKlaar }: { kandidaten: Kandidaat[]; onClose: () => void; onKlaar: (melding: string) => void }) {
  const ib = useChatTeksten().inbox;
  const [zoek, setZoek] = useState("");
  const [gekozen, setGekozen] = useState<string[]>([]);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLocaleLowerCase("nl-NL");
    return q ? kandidaten.filter((k) => k.name.toLocaleLowerCase("nl-NL").includes(q)) : kandidaten;
  }, [kandidaten, zoek]);
  const wissel = (id: string) => setGekozen((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.length >= RONDZEND_MAX ? g : [...g, id]));

  const verstuur = async () => {
    if (!gekozen.length || !tekst.trim() || bezig) return;
    setBezig(true);
    setFout(null);
    const r = await fetch("/api/inbox/rondzenden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: gekozen, text: tekst.trim() }),
    }).catch(() => null);
    setBezig(false);
    const d = (await r?.json().catch(() => null)) as { verstuurd?: number; overgeslagen?: number; error?: { message?: string } } | null;
    if (!r?.ok || !d) {
      setFout(d?.error?.message ?? ib.rondzendMislukt);
      return;
    }
    const verstuurd = d.verstuurd ?? 0;
    const overgeslagen = d.overgeslagen ?? 0;
    onKlaar(overgeslagen ? vulIn(ib.rondzendDeels, { aantal: verstuurd, overgeslagen }) : vulIn(ib.rondzendKlaar, { aantal: verstuurd }));
    onClose();
  };

  return (
    <Shell title={ib.rondzenden} onClose={onClose}>
      <p className="mb-3 text-sm text-neutralx-600">{ib.rondzendenUitleg}</p>
      {kandidaten.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutralx-500">{ib.rondzendGeen}</p>
      ) : (
        <>
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder={ib.rondzendZoek}
            aria-label={ib.rondzendZoek}
            className="field-input mb-2 w-full"
          />
          <ul className="max-h-56 overflow-y-auto rounded-lg border border-hair">
            {zichtbaar.map((k) => (
              <li key={k.userId}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-paper-soft">
                  <input type="checkbox" checked={gekozen.includes(k.userId)} onChange={() => wissel(k.userId)} className="h-4 w-4 accent-brand-600" />
                  <span className="min-w-0 flex-1 truncate">{k.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-neutralx-500">{vulIn(ib.rondzendGekozen, { aantal: gekozen.length, max: RONDZEND_MAX })}</p>
          <label className="mt-3 block">
            <span className="field-label">{ib.rondzendBericht}</span>
            <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={4000} rows={4} className="field-input mt-1 w-full" />
          </label>
          {fout && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-crit">
              {fout}
            </p>
          )}
          <button type="button" onClick={() => void verstuur()} disabled={!gekozen.length || !tekst.trim() || bezig} className="btn-primary mt-3 w-full text-sm disabled:opacity-50">
            {vulIn(ib.rondzendVerstuur, { aantal: gekozen.length })}
          </button>
        </>
      )}
    </Shell>
  );
}
