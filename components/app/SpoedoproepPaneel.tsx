"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

// ---------------------------------------------------------------------------
// Spoedoproep op de dienstpagina van de opdrachtgever (lib/spoed): kies een
// straal en de kanalen, verstuur, en zie de antwoorden binnenkomen (elke 15 s
// ververst). Teksten uit het werkgever-woordenboek (spoed).
// ---------------------------------------------------------------------------

type Kanaal = "push" | "sms" | "whatsapp";

interface Ontvanger {
  userId: string;
  naam: string;
  km: number;
  via: Kanaal[];
  antwoord?: "ja" | "nee";
  uitkomst?: string;
}

interface Stand {
  oproep: { at: string; verloopt: string; radiusKm: number; ontvangers: Ontvanger[]; gestopt?: string } | null;
  open: boolean;
  telling: { verstuurd: number; ja: number; nee: number; open: number; ingepland: number } | null;
  kanalen: Record<Kanaal, boolean>;
}

const STRALEN = [10, 25, 50] as const;

export function SpoedoproepPaneel({ shiftId, seatsFree }: { shiftId: string; seatsFree: number }) {
  const t = useT().spoed;
  const [stand, setStand] = useState<Stand | null>(null);
  const [radius, setRadius] = useState<(typeof STRALEN)[number]>(25);
  const [sms, setSms] = useState(true);
  const [whatsapp, setWhatsapp] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [uitgeklapt, setUitgeklapt] = useState(false);

  const laad = useCallback(async () => {
    try {
      const r = await fetch(`/api/werkgever/spoed?shiftId=${encodeURIComponent(shiftId)}`, { cache: "no-store" });
      if (r.ok) setStand((await r.json()) as Stand);
    } catch {
      /* volgende poll */
    }
  }, [shiftId]);
  useEffect(() => {
    void laad();
  }, [laad]);
  // zolang de oproep open staat: antwoorden ophalen
  useEffect(() => {
    if (!stand?.open) return;
    const id = setInterval(() => void laad(), 15_000);
    return () => clearInterval(id);
  }, [stand?.open, laad]);

  async function verstuur() {
    setBezig(true);
    setMelding(null);
    const kanalen: Kanaal[] = ["push"];
    if (sms && stand?.kanalen.sms) kanalen.push("sms");
    if (whatsapp && stand?.kanalen.whatsapp) kanalen.push("whatsapp");
    try {
      const r = await fetch("/api/werkgever/spoed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId, radiusKm: radius, kanalen }),
      });
      const d = (await r.json().catch(() => ({}))) as Partial<Stand> & { nieuw?: number; mislukt?: number; error?: { message?: string } };
      if (!r.ok) {
        setMelding({ ok: false, tekst: d.error?.message ?? t.failed });
        return;
      }
      setStand(d as Stand);
      setMelding({ ok: true, tekst: fmt(t.sent, { n: d.nieuw ?? 0 }) + (d.mislukt ? ` ${fmt(t.sentFailed, { n: d.mislukt })}` : "") });
    } catch {
      setMelding({ ok: false, tekst: t.failed });
    } finally {
      setBezig(false);
    }
  }

  async function stop() {
    setBezig(true);
    try {
      const r = await fetch(`/api/werkgever/spoed?shiftId=${encodeURIComponent(shiftId)}`, { method: "DELETE" });
      if (r.ok) setStand((await r.json()) as Stand);
    } finally {
      setBezig(false);
    }
  }

  const tijd = (s: string) => new Date(s).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  const kanaalNaam: Record<Kanaal, string> = { push: t.chPush, sms: t.chSms, whatsapp: t.chWhatsapp };
  const o = stand?.oproep ?? null;
  const open = Boolean(stand?.open);

  return (
    <section className="rounded-2xl border border-warn/40 bg-warn/5 p-5 shadow-card" aria-labelledby="spoed-titel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="spoed-titel" className="font-display text-lg font-bold text-ink">
            ⚡ {t.title}
          </h2>
          <p className="mt-1 text-sm text-neutralx-600">{fmt(seatsFree === 1 ? t.subtitleOne : t.subtitle, { n: seatsFree })}</p>
        </div>
        {o && stand?.telling && (
          <div className="flex gap-2 text-center text-xs">
            <Cijfer n={stand.telling.verstuurd} label={t.reached} />
            <Cijfer n={stand.telling.ingepland} label={t.scheduled} tone="ok" />
            <Cijfer n={stand.telling.nee} label={t.declined} />
          </div>
        )}
      </div>

      {open && o ? (
        <p className="mt-3 text-sm text-neutralx-700">{fmt(t.openUntil, { t: tijd(o.verloopt), km: o.radiusKm })}</p>
      ) : o?.gestopt ? (
        <p className="mt-3 text-sm text-neutralx-600">{t.stopped}</p>
      ) : o ? (
        <p className="mt-3 text-sm text-neutralx-600">{t.expired}</p>
      ) : (
        <p className="mt-3 text-sm text-neutralx-700">{t.intro}</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="field-label block">
          {t.radius}
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value) as (typeof STRALEN)[number])} className="field-input">
            {STRALEN.map((km) => (
              <option key={km} value={km}>
                {fmt(t.radiusKm, { km })}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="min-w-0">
          <legend className="field-label">{t.channels}</legend>
          <div className="mt-1.5 space-y-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked readOnly disabled className="h-4 w-4" /> {t.chPush} <span className="text-xs text-neutralx-400">{t.chPushHint}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sms && Boolean(stand?.kanalen.sms)} disabled={!stand?.kanalen.sms} onChange={(e) => setSms(e.target.checked)} className="h-4 w-4" />
              {t.chSms} {!stand?.kanalen.sms && <span className="text-xs text-neutralx-400">{t.chUnavailable}</span>}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={whatsapp && Boolean(stand?.kanalen.whatsapp)} disabled={!stand?.kanalen.whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} className="h-4 w-4" />
              {t.chWhatsapp} {!stand?.kanalen.whatsapp && <span className="text-xs text-neutralx-400">{t.chUnavailable}</span>}
            </label>
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void verstuur()} disabled={bezig || !stand} className="btn-primary disabled:opacity-50">
          {bezig ? t.sending : open ? t.sendAgain : t.send}
        </button>
        {open && (
          <button type="button" onClick={() => void stop()} disabled={bezig} className="btn-ghost text-sm">
            {t.stop}
          </button>
        )}
        <span className="text-xs text-neutralx-500">{t.replyHint}</span>
      </div>
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-3 text-sm font-medium ${melding.ok ? "text-ok" : "text-crit"}`}>
          {melding.tekst}
        </p>
      )}

      {o && o.ontvangers.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setUitgeklapt((v) => !v)} className="text-sm font-semibold text-brand-600 hover:underline">
            {uitgeklapt ? t.hideList : fmt(t.showList, { n: o.ontvangers.length })}
          </button>
          {uitgeklapt && (
            <ul className="mt-2 divide-y divide-hair rounded-xl border border-hair bg-white text-sm">
              {o.ontvangers.map((r) => (
                <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className="font-medium text-ink">{r.naam}</span>
                    <span className="text-neutralx-500"> · {r.km} km · {r.via.map((v) => kanaalNaam[v]).join(", ")}</span>
                  </span>
                  <span className={`text-xs font-semibold ${r.uitkomst === "ingepland" ? "text-ok" : r.antwoord === "nee" ? "text-neutralx-500" : r.antwoord === "ja" ? "text-warn" : "text-neutralx-400"}`}>
                    {r.uitkomst === "ingepland" ? t.rowScheduled : r.antwoord === "ja" ? (r.uitkomst ?? t.rowYes) : r.antwoord === "nee" ? t.rowNo : t.rowOpen}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Cijfer({ n, label, tone }: { n: number; label: string; tone?: "ok" }) {
  return (
    <span className={`rounded-xl px-2.5 py-1.5 ${tone === "ok" ? "bg-ok/10 text-ok" : "bg-white text-ink"}`}>
      <span className="block text-base font-bold">{n}</span>
      <span className="block text-[11px] text-neutralx-500">{label}</span>
    </span>
  );
}
