"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";

// ---------------------------------------------------------------------------
// De telefoon van de kracht bij een terminal (app/dashboard/incheck): geopend
// via de QR op het scherm (?t=<code>&k=<code van nu>) of de NFC-sticker
// (?t=<code>). Eén grote knop: Inchecken of Uitchecken. Daaronder het koppelen
// van een NFC-sleutelhanger (dan hoeft de telefoon er de volgende keer niet
// bij). Teksten in de vijf talen van de app (lib/i18n/freelancer.ts, incheck).
// ---------------------------------------------------------------------------

interface Stand {
  terminal: { naam: string; vestiging: string } | null;
  dienst: { titel: string; start: string; eind: string; shiftId: string } | null;
  actie: "in" | "uit" | "klaar" | null;
  fobs: { hash: string; at: string }[];
}

interface Uitslag {
  ok: boolean;
  actie: "in" | "uit" | "klaar" | "geen-dienst" | "geen-urenbriefje" | "onbekend";
  tijd: string;
}

export function IncheckOpLocatie() {
  const ft = useFT();
  const t = ft.incheck;
  const router = useRouter();
  const q = useSearchParams();
  const code = q.get("t") ?? "";
  const k = q.get("k") ?? "";
  const [stand, setStand] = useState<Stand | null>(null);
  const [laadFout, setLaadFout] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [koppel, setKoppel] = useState<number | null>(null);
  /** hoeveel sleutelhangers er waren toen het koppelen begon */
  const [fobsBijStart, setFobsBijStart] = useState<number | null>(null);
  const tijd = (s: string) => new Date(s).toLocaleTimeString(ft.intl, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  const dag = (s: string) => new Date(s).toLocaleDateString(ft.intl, { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });

  const laad = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/incheck?t=${encodeURIComponent(code)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setStand((await res.json()) as Stand);
      setLaadFout(false);
    } catch {
      setLaadFout(true);
    }
  }, [code]);
  useEffect(() => {
    void laad();
  }, [laad]);

  // het aftellen tijdens het koppelen van een sleutelhanger
  useEffect(() => {
    if (koppel === null) return;
    if (koppel <= 0) {
      setKoppel(null);
      void laad();
      return;
    }
    const id = setTimeout(() => setKoppel(koppel - 1), 1000);
    // elke 5 s kijken of de hanger al is gekoppeld
    if (koppel % 5 === 0) void laad();
    return () => clearTimeout(id);
  }, [koppel, laad]);
  // een nieuwe hanger verscheen in de lijst: het koppelen is klaar
  useEffect(() => {
    if (koppel !== null && fobsBijStart !== null && stand && stand.fobs.length > fobsBijStart) {
      setKoppel(null);
      setFobsBijStart(null);
      setMelding({ ok: true, tekst: t.fobLinked });
    }
  }, [stand, koppel, fobsBijStart, t.fobLinked]);

  async function post(body: Record<string, string>): Promise<Record<string, unknown> | null> {
    setBezig(true);
    setMelding(null);
    try {
      const res = await fetch("/api/dashboard/incheck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
      if (!res.ok) {
        setMelding({ ok: false, tekst: d.error?.message ?? t.failed });
        return null;
      }
      return d;
    } catch {
      setMelding({ ok: false, tekst: t.failed });
      return null;
    } finally {
      setBezig(false);
    }
  }

  async function incheck() {
    const d = (await post({ actie: "incheck", code, ...(k ? { k } : {}) })) as Uitslag | null;
    if (!d) return;
    const tekst =
      d.actie === "in" ? t.okIn(tijd(d.tijd)) : d.actie === "uit" ? t.okOut(tijd(d.tijd)) : d.actie === "klaar" ? t.done : d.actie === "geen-dienst" ? t.noShift : d.actie === "geen-urenbriefje" ? t.noTimesheet : t.failed;
    setMelding({ ok: d.ok, tekst });
    void laad();
    router.refresh();
  }

  async function startKoppel() {
    const d = await post({ actie: "koppel", code });
    if (d) {
      setFobsBijStart(stand?.fobs.length ?? 0);
      setKoppel(120);
    }
  }

  async function ontkoppel(hash: string) {
    const d = await post({ actie: "ontkoppel", hash });
    if (d) void laad();
  }

  if (!code) {
    return (
      <div className="card space-y-3 p-5">
        <p className="text-sm text-neutralx-600">{t.noCode}</p>
        <Uitleg t={t} />
      </div>
    );
  }
  if (laadFout) {
    return (
      <div className="card p-5">
        <p role="alert" className="text-sm text-crit">
          {t.failed}
        </p>
        <button type="button" onClick={() => void laad()} className="mt-3 rounded-xl border border-hair px-4 py-2 text-sm font-semibold">
          {t.retry}
        </button>
      </div>
    );
  }
  if (!stand) return <p className="text-sm text-neutralx-500">{t.loading}</p>;
  if (!stand.terminal) {
    return (
      <div className="card space-y-3 p-5">
        <p role="alert" className="text-sm text-warn">
          {t.noTerminal}
        </p>
        <Uitleg t={t} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-xl">📍</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{t.at(stand.terminal.vestiging)}</span>
            <span className="block text-xs text-neutralx-500">{stand.terminal.naam}</span>
          </span>
        </div>
        {stand.dienst ? (
          <p className="rounded-xl bg-paper-soft px-3 py-2 text-sm text-ink">
            <strong>{stand.dienst.titel}</strong> · {dag(stand.dienst.start)} {tijd(stand.dienst.start)} – {tijd(stand.dienst.eind)}
          </p>
        ) : (
          <p className="text-sm text-warn">{t.noShift}</p>
        )}
        {stand.actie && stand.actie !== "klaar" && (
          <button
            type="button"
            disabled={bezig}
            onClick={() => void incheck()}
            className={`w-full rounded-xl py-4 text-lg font-bold text-white disabled:opacity-60 ${stand.actie === "in" ? "bg-brand-500" : "bg-ink"}`}
          >
            {bezig ? t.busy : stand.actie === "in" ? t.doIn : t.doOut}
          </button>
        )}
        {stand.actie === "klaar" && <p className="text-sm text-ok">{t.done}</p>}
        {melding && (
          <p role={melding.ok ? "status" : "alert"} className={`text-sm font-medium ${melding.ok ? "text-ok" : "text-warn"}`}>
            {melding.tekst}
          </p>
        )}
        <p className="text-xs text-neutralx-400">{t.privacy}</p>
      </div>

      <div className="card space-y-3 p-5">
        <p className="font-semibold text-ink">{t.fobTitle}</p>
        <p className="text-sm text-neutralx-600">{t.fobIntro}</p>
        {koppel !== null ? (
          <p role="status" className="rounded-xl bg-warn/10 px-3 py-2 text-sm font-medium text-warn">
            {t.fobWaiting(koppel)}
          </p>
        ) : (
          <button type="button" disabled={bezig || stand.fobs.length >= 5} onClick={() => void startKoppel()} className="rounded-xl border border-hair px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
            {t.fobStart}
          </button>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{t.fobsMine}</p>
          {stand.fobs.length === 0 ? (
            <p className="mt-1 text-sm text-neutralx-500">{t.fobNone}</p>
          ) : (
            <ul className="mt-1 divide-y divide-hair text-sm">
              {stand.fobs.map((f, i) => (
                <li key={f.hash} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {t.fobLabel(i + 1)} <span className="text-neutralx-500">· {t.fobAdded(dag(f.at))}</span>
                  </span>
                  <button type="button" onClick={() => void ontkoppel(f.hash)} className="text-xs font-semibold text-crit hover:underline">
                    {t.fobRemove}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Uitleg t={t} />
    </div>
  );
}

function Uitleg({ t }: { t: ReturnType<typeof useFT>["incheck"] }) {
  return (
    <div className="card p-5">
      <p className="font-semibold text-ink">{t.howTitle}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutralx-600">
        <li>{t.how1}</li>
        <li>{t.how2}</li>
        <li>{t.how3}</li>
      </ol>
    </div>
  );
}
