"use client";

import { useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Tabblad Teksten: alle bewerkbare sitetekst (lib/content/store.ts, via
// /api/admin/content). Typen laat het voorbeeld meteen meekijken; Opslaan
// zet de tekst live. Een klik op een tekst in het voorbeeld opent hier het veld.
// AI kan een veld herschrijven, maar je kiest zelf of je het voorstel neemt.
// ---------------------------------------------------------------------------

interface Item {
  key: string;
  label: string;
  default: string;
  group?: string;
  multiline?: boolean;
}

const AI_KNOPPEN = [
  ["verbeter", "Verbeter"],
  ["korter", "Korter"],
  ["langer", "Langer"],
  ["zakelijk", "Zakelijker"],
  ["vriendelijk", "Vriendelijker"],
] as const;

const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };

/** zelfde vorm als lib/content/geschiedenis.ts (dat bestand gebruikt de server-opslag) */
export interface TekstWijziging {
  id: string;
  key: string;
  oud: string;
  nieuw: string;
  op: string;
}

export const tijdNl = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Bij het actieve veld: de teksten van vóór eerdere wijzigingen; "Gebruik deze" zet hem in het veld (daarna zelf opslaan). */
function EerdereVersies({ wijzigingen, huidig, onGebruik }: { wijzigingen: TekstWijziging[]; huidig: string; onGebruik: (t: string) => void }) {
  // elke oude tekst één keer, en niet de tekst die nu al in het veld staat
  const gezien = new Set<string>([huidig]);
  const versies: TekstWijziging[] = [];
  for (const w of wijzigingen) {
    if (gezien.has(w.oud) || versies.length >= 5) continue;
    gezien.add(w.oud);
    versies.push(w);
  }
  if (!versies.length) return null;
  return (
    <details className="mt-2 rounded-lg p-2 text-xs" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
      <summary className="cursor-pointer font-semibold">Eerdere versies ({versies.length})</summary>
      <ul className="mt-2 space-y-2">
        {versies.map((w) => (
          <li key={w.id} className="space-y-1">
            <p className="text-[11px]" style={{ color: "var(--a-mute)" }}>
              Tot {tijdNl(w.op)}
            </p>
            <p className="whitespace-pre-line">{w.oud}</p>
            <button type="button" onClick={() => onGebruik(w.oud)} className="a-button text-[11px]">
              Gebruik deze
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function TekstenPaneel({
  gekozen,
  kiesN = 0,
  onKies,
  onTeksten,
  injectie = null,
}: {
  /** het veld dat in het voorbeeld is aangeklikt */
  gekozen: string | null;
  /** telt elke keuze (ook dezelfde tekst nog eens), zodat het veld weer in beeld komt */
  kiesN?: number;
  onKies: (key: string | null) => void;
  /** de teksten zoals ze nu in de velden staan, voor het voorbeeld */
  onTeksten: (t: Record<string, string>) => void;
  /** een tekst van de assistent: komt in het veld, nog niet opgeslagen */
  injectie?: { key: string; waarde: string; n: number } | null;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [bewaard, setBewaard] = useState<Record<string, string>>({});
  const [invoer, setInvoer] = useState<Record<string, string>>({});
  const [zoek, setZoek] = useState("");
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ key: string; tekst: string; fout?: boolean } | null>(null);
  const [voorstel, setVoorstel] = useState<{ key: string; tekst: string } | null>(null);
  const [geschiedenis, setGeschiedenis] = useState<TekstWijziging[]>([]);

  useEffect(() => {
    fetch("/api/admin/content", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { registry: Item[]; values: Record<string, string>; geschiedenis?: TekstWijziging[] } | null) => {
        if (!d) return;
        setItems(d.registry);
        setBewaard(d.values);
        setInvoer(d.values);
        setGeschiedenis(d.geschiedenis ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    onTeksten(invoer);
  }, [invoer, onTeksten]);

  useEffect(() => {
    if (injectie) setInvoer((c) => ({ ...c, [injectie.key]: injectie.waarde }));
  }, [injectie]);

  // aangeklikt in het voorbeeld: zoekfilter weg, veld in beeld en focus
  useEffect(() => {
    if (!gekozen) return;
    setZoek("");
    const t = window.setTimeout(() => {
      const el = document.getElementById(`tekst-${gekozen}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [gekozen, kiesN]);

  const groepen = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    const zichtbaar = items.filter((i) => !q || `${i.label} ${i.group ?? ""} ${invoer[i.key] ?? ""}`.toLowerCase().includes(q));
    const map = new Map<string, Item[]>();
    for (const i of zichtbaar) map.set(i.group ?? "Overig", [...(map.get(i.group ?? "Overig") ?? []), i]);
    return [...map.entries()];
  }, [items, zoek, invoer]);

  async function opslaan(key: string) {
    setBezig(key);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/content", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: invoer[key] ?? "" }) });
      const d = (await r.json().catch(() => null)) as { values?: Record<string, string>; geschiedenis?: TekstWijziging[] } | null;
      if (!r.ok || !d?.values) throw new Error();
      const vals = d.values;
      setBewaard(vals);
      if (d.geschiedenis) setGeschiedenis(d.geschiedenis);
      setInvoer((cur) => ({ ...cur, [key]: vals[key] ?? cur[key] ?? "" }));
      setMelding({ key, tekst: "Opgeslagen en live." });
    } catch {
      setMelding({ key, tekst: "Opslaan lukte niet. Probeer het opnieuw.", fout: true });
    } finally {
      setBezig(null);
    }
  }

  async function vraagAi(item: Item, opdracht: (typeof AI_KNOPPEN)[number][0]) {
    setBezig(item.key);
    setMelding(null);
    setVoorstel(null);
    try {
      const r = await fetch("/api/admin/ontwerp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "ai-tekst", tekst: invoer[item.key] || item.default, opdracht, label: `${item.group ?? ""} — ${item.label}` }),
      });
      const d = (await r.json().catch(() => null)) as { tekst?: string; error?: { message?: string } } | null;
      if (!r.ok || !d?.tekst) throw new Error(d?.error?.message ?? "De AI-hulp gaf geen voorstel.");
      setVoorstel({ key: item.key, tekst: d.tekst });
    } catch (e) {
      setMelding({ key: item.key, tekst: e instanceof Error ? e.message : "De AI-hulp gaf geen voorstel.", fout: true });
    } finally {
      setBezig(null);
    }
  }

  if (!items.length) {
    return (
      <p className="text-sm" style={{ color: "var(--a-mute)" }}>
        Teksten laden…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        Klik in het voorbeeld op een gemarkeerde tekst of zoek hieronder. Je ziet het meteen in het voorbeeld; met Opslaan staat de tekst live. Leeg laten = de
        oorspronkelijke tekst.
      </p>
      <input type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een tekst…" aria-label="Zoek een tekst" className="w-full rounded-lg px-3 py-2 text-sm" style={veld} />
      {groepen.map(([groep, lijst]) => (
        <section key={groep} className="space-y-3 rounded-xl p-4" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
            {groep}
          </h2>
          {lijst.map((item) => {
            const waarde = invoer[item.key] ?? "";
            const gewijzigd = waarde !== (bewaard[item.key] ?? "");
            const id = `tekst-${item.key}`;
            const actief = gekozen === item.key;
            return (
              <div key={item.key} className="rounded-lg p-2" style={{ background: actief ? "var(--a-accent-soft)" : "transparent" }}>
                <label htmlFor={id} className="mb-1 block text-xs" style={{ color: "var(--a-mute)" }}>
                  {item.label}
                </label>
                {item.multiline ? (
                  <textarea id={id} value={waarde} rows={3} maxLength={2000} onFocus={() => onKies(item.key)} onChange={(e) => setInvoer((c) => ({ ...c, [item.key]: e.target.value }))} className="w-full rounded-lg px-2.5 py-2 text-sm" style={veld} />
                ) : (
                  <input id={id} value={waarde} maxLength={2000} onFocus={() => onKies(item.key)} onChange={(e) => setInvoer((c) => ({ ...c, [item.key]: e.target.value }))} className="w-full rounded-lg px-2.5 py-2 text-sm" style={veld} />
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {gewijzigd ? (
                    <>
                      <button type="button" onClick={() => opslaan(item.key)} disabled={bezig === item.key} className="a-button a-button-primary text-xs">
                        {bezig === item.key ? "Bezig…" : "Opslaan"}
                      </button>
                      <button type="button" onClick={() => setInvoer((c) => ({ ...c, [item.key]: bewaard[item.key] ?? "" }))} className="a-button text-xs">
                        Herstel
                      </button>
                    </>
                  ) : null}
                  {waarde !== item.default ? (
                    <button type="button" onClick={() => setInvoer((c) => ({ ...c, [item.key]: item.default }))} className="text-[11px] font-semibold hover:underline" style={{ color: "var(--a-mute)" }}>
                      Oorspronkelijke tekst
                    </button>
                  ) : null}
                  {actief
                    ? AI_KNOPPEN.map(([k, label]) => (
                        <button key={k} type="button" disabled={bezig === item.key} onClick={() => vraagAi(item, k)} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--a-elev)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}>
                          AI: {label}
                        </button>
                      ))
                    : null}
                </div>
                {voorstel?.key === item.key ? (
                  <div className="mt-2 rounded-lg p-2.5 text-sm" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
                    <p className="text-[11px] font-semibold" style={{ color: "var(--a-mute)" }}>
                      Voorstel van de AI
                    </p>
                    <p className="mt-1 whitespace-pre-line">{voorstel.tekst}</p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setInvoer((c) => ({ ...c, [item.key]: voorstel.tekst }));
                          setVoorstel(null);
                        }}
                        className="a-button a-button-primary text-xs"
                      >
                        Gebruik dit
                      </button>
                      <button type="button" onClick={() => setVoorstel(null)} className="a-button text-xs">
                        Laat staan
                      </button>
                    </div>
                  </div>
                ) : null}
                {melding?.key === item.key ? (
                  <p role={melding.fout ? "alert" : "status"} className="mt-1 text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
                    {melding.tekst}
                  </p>
                ) : null}
                {actief ? <EerdereVersies wijzigingen={geschiedenis.filter((w) => w.key === item.key)} huidig={waarde} onGebruik={(t) => setInvoer((c) => ({ ...c, [item.key]: t }))} /> : null}
              </div>
            );
          })}
        </section>
      ))}
      {!groepen.length ? (
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Geen tekst gevonden met “{zoek}”.
        </p>
      ) : null}
    </div>
  );
}
