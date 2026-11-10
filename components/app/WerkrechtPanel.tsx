"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { AUTH_DICTS, type AuthDict } from "@/lib/i18n/auth";
import { WERK_LANDEN, landNaam, type WerkrechtStand } from "@/lib/werkrecht/landen";

// ---------------------------------------------------------------------------
// Recht om te werken per land (Verificatie): per land een verklaring om aan te
// vinken en het bewijs (upload), Nederland altijd. Vóór een betaalde dienst
// controleert de server hetzelfde (lib/fiscal/eligibility.ts → lib/werkrecht).
// ---------------------------------------------------------------------------

interface Land {
  id: string | null;
  land: string;
  stand: WerkrechtStand;
  verklaard: boolean;
  idBewijs: boolean;
  document: { status: "uploaded" | "approved" | "rejected"; filename: string; geldigTot: string | null; note: string | null } | null;
}

type T = AuthDict["page"]["werkrecht"];

const TOON: Record<WerkrechtStand, string> = {
  "verklaring-nodig": "text-warn",
  "bewijs-nodig": "text-warn",
  wacht: "text-neutralx-500",
  afgewezen: "text-crit",
  verlopen: "text-warn",
  ok: "text-ok",
};

/** "2027-03-31" → "31-03-2027" (geen tijdzone nodig: het is al een Nederlandse dag) */
function dagNl(d: string): string {
  const [j, m, dd] = d.split("-");
  return `${dd}-${m}-${j}`;
}

async function stuur(url: string, init: RequestInit, fout: string): Promise<Land[]> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as { landen?: Land[]; error?: { message?: string } };
  if (!res.ok || !data.landen) throw new Error(data.error?.message ?? fout);
  return data.landen;
}

function LandKaart({ l, t, locale, onLanden }: { l: Land; t: T; locale: string; onLanden: (x: Land[]) => void }) {
  const router = useRouter();
  const naam = landNaam(l.land, locale);
  const vinkId = useId();
  const datumId = useId();
  const bestandId = useId();
  const bestand = useRef<HTMLInputElement>(null);
  const [vink, setVink] = useState(false);
  const [geldigTot, setGeldigTot] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function doe(werk: () => Promise<Land[]>) {
    setBezig(true);
    setFout(null);
    try {
      onLanden(await werk());
      // de poort van de app (lib/onboarding/werker-poort.ts) leest dit in de layout: opnieuw laden
      router.refresh();
    } catch (e) {
      setFout((e as Error).message || t.fout);
    } finally {
      setBezig(false);
    }
  }

  const verklaar = () =>
    doe(() =>
      stuur("/api/me/werkrecht", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ land: l.land, verklaring: true }) }, t.fout),
    );

  const upload = () => {
    const file = bestand.current?.files?.[0];
    if (!file) {
      setFout(t.bestand);
      return;
    }
    const fd = new FormData();
    fd.set("land", l.land);
    fd.set("file", file);
    fd.set("geldigTot", geldigTot);
    void doe(() => stuur("/api/me/werkrecht/bewijs", { method: "POST", body: fd }, t.fout));
  };

  const weg = () => doe(() => stuur(`/api/me/werkrecht?land=${encodeURIComponent(l.land)}`, { method: "DELETE" }, t.fout));

  const bewijsNodig = l.verklaard && !l.idBewijs && l.stand !== "ok" && l.stand !== "wacht";
  const ok = l.stand === "ok";

  return (
    <div className={`rounded-xl border p-4 ${ok ? "border-ok/40 bg-ok/5" : "border-hairstrong"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{naam}</p>
        <span className={`text-xs font-medium ${TOON[l.stand]}`}>{t.stand[l.stand]}</span>
      </div>

      {l.idBewijs ? null : !l.verklaard ? (
        <div className="mt-3">
          <label htmlFor={vinkId} className="flex items-start gap-2.5 text-sm leading-relaxed text-neutralx-600">
            <input id={vinkId} type="checkbox" checked={vink} onChange={(e) => setVink(e.target.checked)} className="mt-1 h-4 w-4 flex-shrink-0" />
            <span>{t.verklaring.replace("{land}", naam)}</span>
          </label>
          <button type="button" disabled={!vink || bezig} onClick={() => void verklaar()} className="btn-primary mt-3 disabled:opacity-50">
            {t.verklaringKnop}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-neutralx-500">✓ {t.verklaard}</p>
      )}

      {/* EU/EER/CH-document uit de ID-controle: geen verklaring en niets te uploaden */}
      {l.idBewijs && <p className="mt-2 text-sm text-neutralx-600">{t.bewijsEu}</p>}

      {l.document && !l.idBewijs && (
        <p className="mt-2 text-xs text-neutralx-500">
          {l.document.filename}
          {l.document.geldigTot ? `, ${t.documentGeldig.replace("{datum}", dagNl(l.document.geldigTot))}` : ""}
        </p>
      )}
      {l.document?.status === "rejected" && l.document.note && (
        <p className="mt-1 text-sm text-crit">{t.reden.replace("{reden}", l.document.note)}</p>
      )}

      {bewijsNodig && (
        <div className="mt-3 grid gap-3">
          <p className="text-sm leading-relaxed text-neutralx-600">{t.bewijsUitleg.replace("{land}", naam)}</p>
          <div className="grid gap-1">
            <label htmlFor={bestandId} className="field-label">{t.bestand}</label>
            <input id={bestandId} ref={bestand} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" />
          </div>
          <div className="grid gap-1">
            <label htmlFor={datumId} className="field-label">{t.geldigTot}</label>
            <input id={datumId} type="date" value={geldigTot} onChange={(e) => setGeldigTot(e.target.value)} className="field-input max-w-[12rem]" />
          </div>
          <button type="button" disabled={bezig || !geldigTot} onClick={upload} className="btn-primary disabled:opacity-50">
            {bezig ? t.uploading : l.document ? t.vervang : t.upload}
          </button>
        </div>
      )}

      {l.land !== "NL" && (
        <button type="button" disabled={bezig} onClick={() => void weg()} className="btn-ghost mt-3 text-xs disabled:opacity-50">
          {t.weg}
        </button>
      )}
      {fout && (
        <p role="alert" className="mt-2 text-xs text-crit">
          {fout}
        </p>
      )}
    </div>
  );
}

export function WerkrechtPanel() {
  const { locale } = useI18n();
  const t = AUTH_DICTS[locale].page.werkrecht;
  const kiesId = useId();
  const [landen, setLanden] = useState<Land[] | null>(null);
  const [nieuw, setNieuw] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setLanden(await stuur("/api/me/werkrecht", { method: "GET" }, t.fout));
      } catch (e) {
        setFout((e as Error).message);
      }
    })();
  }, [t.fout]);

  async function voegToe() {
    if (!nieuw) return;
    setBezig(true);
    setFout(null);
    try {
      setLanden(await stuur("/api/me/werkrecht", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ land: nieuw, verklaring: true }) }, t.fout));
      setNieuw("");
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig(false);
    }
  }

  const gekozen = new Set((landen ?? []).map((l) => l.land));
  const keuze = WERK_LANDEN.filter((c) => !gekozen.has(c))
    .map((c) => ({ c, naam: landNaam(c, locale) }))
    .sort((a, b) => a.naam.localeCompare(b.naam, locale));

  return (
    <div>
      <p className="text-sm leading-relaxed text-neutralx-600">{t.intro}</p>
      {landen === null && !fout && <div className="mt-4 h-20 animate-pulse rounded-xl bg-paper-soft" aria-busy="true" />}
      {landen && (
        <div className="mt-4 grid gap-3">
          {landen.map((l) => (
            <LandKaart key={l.land} l={l} t={t} locale={locale} onLanden={setLanden} />
          ))}
        </div>
      )}
      {landen && (
        <div className="mt-5">
          <label htmlFor={kiesId} className="text-sm font-semibold text-ink">
            {t.anderLand}
          </label>
          <p className="mt-1 text-xs text-neutralx-500">{t.verklaring.replace("{land}", nieuw ? landNaam(nieuw, locale) : "…")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select id={kiesId} value={nieuw} onChange={(e) => setNieuw(e.target.value)} className="field-input max-w-[16rem]">
              <option value="">{t.kiesLand}</option>
              {keuze.map(({ c, naam }) => (
                <option key={c} value={c}>
                  {naam}
                </option>
              ))}
            </select>
            <button type="button" disabled={!nieuw || bezig} onClick={() => void voegToe()} className="btn-primary disabled:opacity-50">
              {t.toevoegen}
            </button>
          </div>
        </div>
      )}
      {fout && (
        <p role="alert" className="mt-3 text-sm text-crit">
          {fout}
        </p>
      )}
    </div>
  );
}
