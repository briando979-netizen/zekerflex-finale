"use client";

import { useCallback, useEffect, useState } from "react";
import { vulIn } from "@/lib/i18n/vul-in";
import { waardeOk, type Taak } from "@/lib/horeca/taken";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// De takenlijsten van vandaag voor een medewerker (app/personeel): afvinken, bij een meting de waarde invullen, en terugdraaien.
// Alle tekst komt van de server (lib/horeca-personeel/teksten.ts); de namen van lijsten en taken zijn van de zaak zelf.

const API = "/api/personeel/taken";

interface Vinkje {
  taak: number;
  door: string;
  waarde: string;
  op: string;
}
interface Lijst {
  id: string;
  naam: string;
  moment: string;
  periode: string;
  taken: Taak[];
  vinkjes: Vinkje[];
}

async function aanroep(body?: unknown): Promise<{ lijsten: Lijst[]; binnenGrens?: boolean | null }> {
  const res = await fetch(API, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { lijsten?: Lijst[]; binnenGrens?: boolean | null; error?: { message?: string } };
  if (!res.ok || !data.lijsten) throw new Error(data.error?.message ?? "fout");
  return { lijsten: data.lijsten, ...(data.binnenGrens !== undefined ? { binnenGrens: data.binnenGrens } : {}) };
}

export function TakenBlok({ t }: { t: PersoneelTeksten["omgeving"] }) {
  const [lijsten, setLijsten] = useState<Lijst[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [waarschuwing, setWaarschuwing] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [waarden, setWaarden] = useState<Record<string, string>>({});

  const laad = useCallback(async () => {
    try {
      setLijsten((await aanroep()).lijsten);
    } catch (e) {
      setFout(e instanceof Error && e.message !== "fout" ? e.message : t.fout);
    }
  }, [t.fout]);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function doe(sleutel: string, body: unknown) {
    setBezig(sleutel);
    setFout(null);
    setWaarschuwing(null);
    try {
      const r = await aanroep(body);
      setLijsten(r.lijsten);
      if (r.binnenGrens === false) setWaarschuwing(t.buitenGrens);
    } catch (e) {
      setFout(e instanceof Error && e.message !== "fout" ? e.message : t.fout);
    } finally {
      setBezig(null);
    }
  }

  return (
    <section aria-labelledby="pers-taken" className="space-y-4">
      <div>
        <h2 id="pers-taken" className="font-display text-xl font-bold text-ink">
          {t.takenKop}
        </h2>
        <p className="mt-1 text-sm text-neutralx-600">{t.takenUitleg}</p>
      </div>
      {fout && (
        <p role="alert" className="text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      {waarschuwing && (
        <p role="alert" className="text-sm font-medium text-ink">
          {waarschuwing}
        </p>
      )}
      {lijsten === null ? (
        <p className="text-sm text-neutralx-500">{t.bezig}</p>
      ) : lijsten.length === 0 ? (
        <p className="text-sm text-neutralx-500">{t.geenTaken}</p>
      ) : (
        lijsten.map((l) => (
          <div key={l.id} className="rounded-2xl border border-hair bg-white p-4">
            <h3 className="font-semibold text-ink">{l.naam}</h3>
            <ul className="mt-3 divide-y divide-hair">
              {l.taken.map((taak, i) => {
                const vink = l.vinkjes.find((v) => v.taak === i);
                const sleutel = `${l.id}:${i}`;
                const ingevuld = waarden[sleutel] ?? "";
                return (
                  <li key={sleutel} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className={`min-w-0 flex-1 text-sm ${vink ? "text-neutralx-500 line-through" : "text-ink"}`}>{taak.tekst}</span>
                    {vink ? (
                      <>
                        <span className="text-xs text-neutralx-500">
                          {vink.waarde ? `${vink.waarde} · ` : ""}
                          {vulIn(t.afgevinktDoor, { naam: vink.door })}
                          {taak.meten && waardeOk(taak, vink.waarde) === false ? ` · ${t.buitenGrens}` : ""}
                        </span>
                        <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={bezig === sleutel} onClick={() => void doe(sleutel, { actie: "terug", lijstId: l.id, taak: i })}>
                          {t.terugdraaien}
                        </button>
                      </>
                    ) : (
                      <>
                        {taak.meten && (
                          <>
                            <label htmlFor={`pers-w-${sleutel}`} className="sr-only">
                              {t.metenLabel}
                            </label>
                            <input
                              id={`pers-w-${sleutel}`}
                              type="text"
                              inputMode="decimal"
                              value={ingevuld}
                              onChange={(e) => setWaarden((w) => ({ ...w, [sleutel]: e.target.value }))}
                              placeholder={t.metenLabel}
                              className="h-11 w-28 rounded-lg border border-hairstrong bg-white px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                            />
                          </>
                        )}
                        <button type="button" className="btn-primary min-h-[44px] text-sm" disabled={bezig === sleutel} onClick={() => void doe(sleutel, { actie: "af", lijstId: l.id, taak: i, waarde: ingevuld })}>
                          {t.afvinken}
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
