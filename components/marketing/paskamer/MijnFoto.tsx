"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { POSE } from "@/lib/shop/foto-meting";
import { CSP_HERLAAD_VLAG, FOTO_FOUT_TEKST, foutRapport, fotoFoutSoort, isCspWasmFout, moetHerladen, type FotoFout } from "@/lib/shop/foto-fout";
import type { FotoUitkomst } from "@/components/marketing/paskamer/fotoMeting";

// "Op mijn foto": de klant uploadt een foto van zichzelf (hele lichaam, van
// voren). Op het toestel zelf meten we maten, gezicht, huid en haar; daarna
// staat dat op de 3D-paspop. Gratis en privé: de foto gaat nergens heen.

export type Toepassing = { lengte: number; borst: number | null; taille: number | null; huid: string | null; haarKleur: string | null; gezicht: string | null };

const PROBLEEM_TEKST = { "geen-mens": "pasFotoGeenMens", "niet-heel": "pasFotoNietHeel", "niet-voor": "pasFotoNietVoor", klein: "pasFotoKlein" } as const;

// De echte oorzaak (soort, stap, naam en bericht van de fout; geen foto of bestandsnaam) naar het
// foutenlogboek via de bestaande client-error-route. Best-effort: melden mag nooit zelf falen.
function meldAanLogboek(fout: unknown): void {
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message: foutRapport(fout), url: window.location.pathname, userAgent: navigator.userAgent.slice(0, 300) }),
    }).catch(() => undefined);
  } catch {
    /* geen netwerk of fetch: negeren */
  }
}

export function MijnFoto({ lengte: begin, onToepassen }: { lengte: number; onToepassen: (t: Toepassing) => void }) {
  const p = useT().paskamer;
  const [lengte, setLengte] = useState(begin);
  const [bestand, setBestand] = useState<File | null>(null);
  const [stap, setStap] = useState<"" | "laden" | "meten">("");
  const [uit, setUit] = useState<FotoUitkomst | null>(null);
  const [fout, setFout] = useState<FotoFout | null>(null);
  const [borst, setBorst] = useState("");
  const [taille, setTaille] = useState("");
  const [afm, setAfm] = useState<{ w: number; h: number } | null>(null);
  const invoer = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!uit) return setAfm(null);
    const im = new Image();
    im.onload = () => setAfm({ w: im.naturalWidth, h: im.naturalHeight });
    im.src = uit.beeld;
    setBorst(uit.meting ? String(uit.meting.borst) : "");
    setTaille(uit.meting ? String(uit.meting.taille) : "");
  }, [uit]);

  const meet = async (f: File, l: number) => {
    setStap("laden");
    setFout(null);
    setUit(null);
    try {
      const { meetFoto } = await import("@/components/marketing/paskamer/fotoMeting");
      setUit(await meetFoto(f, l, (s) => setStap(s)));
      // het model laadde: de herlaad-vlag mag weer vrij voor een volgende keer
      try {
        window.sessionStorage.removeItem(CSP_HERLAAD_VLAG);
      } catch {
        /* geen opslag: niets te wissen */
      }
    } catch (e) {
      // Vangnet: de CSP van het eerste document liet WebAssembly niet toe (paskamer via een client-navigatie geopend).
      // Eenmaal volledig herladen geeft de juiste CSP; de vlag voorkomt een lus, en zonder opslag volgt alleen de melding.
      let opslag: Storage | null = null;
      try {
        opslag = window.sessionStorage;
      } catch {
        opslag = null;
      }
      if (moetHerladen(isCspWasmFout(e), opslag)) {
        window.location.reload();
        return;
      }
      setFout(fotoFoutSoort(e));
      meldAanLogboek(e);
    } finally {
      setStap("");
    }
  };

  const kies = (f: File | undefined) => {
    if (!f) return;
    setBestand(f);
    void meet(f, lengte);
  };

  const getal = (v: string, min: number, max: number) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
  };

  const probleem = uit ? uit.problemen.find((x) => x === "geen-mens" || x === "niet-heel") ?? null : null;
  const waarschuwing = uit ? uit.problemen.filter((x) => x !== probleem) : [];
  const punten = uit?.punten;

  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
        {uit && afm ? (
          <div className="mx-auto h-full max-h-full w-full">
            <div className="relative mx-auto h-full max-w-full" style={{ aspectRatio: `${afm.w} / ${afm.h}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- lokale foto van de klant */}
              <img src={uit.beeld} alt={p.pasFotoJouw} className="h-full w-full rounded-xl object-contain" />
              {punten && (
                <svg viewBox={`0 0 ${afm.w} ${afm.h}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                  {uit.meting &&
                    (["borst", "taille", "heup"] as const).map((k) => {
                      const sl = punten[POSE.schouderL];
                      const sr = punten[POSE.schouderR];
                      if (!sl || !sr) return null;
                      const y = uit.meting?.rijen[k] ?? 0;
                      const x1 = Math.min(sl.x, sr.x) * afm.w;
                      const x2 = Math.max(sl.x, sr.x) * afm.w;
                      return <line key={k} x1={x1} x2={x2} y1={y} y2={y} stroke={k === "borst" ? "#4fe0a0" : k === "taille" ? "#f5c451" : "#7c9cff"} strokeWidth={Math.max(2, afm.w / 220)} strokeDasharray="10 6" />;
                    })}
                  {[POSE.neus, POSE.schouderL, POSE.schouderR, POSE.heupL, POSE.heupR, POSE.enkelL, POSE.enkelR].map((i) => (
                    <circle key={i} cx={(punten[i]?.x ?? 0) * afm.w} cy={(punten[i]?.y ?? 0) * afm.h} r={Math.max(4, afm.w / 120)} fill="#fff" stroke="#0e5c4a" strokeWidth={Math.max(2, afm.w / 300)} />
                  ))}
                </svg>
              )}
            </div>
          </div>
        ) : stap ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-hair border-t-brand-500" aria-hidden />
              <p role="status" className="mt-3 text-[14px] font-semibold text-ink">
                {stap === "laden" ? p.pasFotoLaden : p.pasFotoBezig}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-xs">
              <p className="font-display text-[20px] font-bold text-ink">{p.pasFotoTitel}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-neutralx-600">{p.pasFotoUitleg}</p>
              <ul className="mt-3 space-y-1 text-left text-[13px] text-neutralx-600">
                {p.pasFotoTips.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2.5 border-t border-hair p-3">
        {fout && (
          <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-[13px] font-semibold text-crit">
            {p[FOTO_FOUT_TEKST[fout]]}
          </p>
        )}
        {probleem && (
          <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-[13px] font-semibold text-crit">
            {p[PROBLEEM_TEKST[probleem]]}
          </p>
        )}
        {waarschuwing.map((w) => (
          <p key={w} role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-[12px] font-semibold text-warn">
            {p[PROBLEEM_TEKST[w]]}
          </p>
        ))}

        {((uit && !probleem) || fout) && (
          <div className="space-y-2.5">
            {fout && <p className="text-[13px] font-bold text-ink">{p.pasFotoHandmatigTitel}</p>}
            <div className="flex flex-wrap items-center gap-3">
              {uit?.gezicht && (
                // eslint-disable-next-line @next/next/no-img-element -- uitgesneden gezicht uit de foto
                <img src={uit.gezicht} alt={p.fotoTitel} className="h-14 w-[45px] rounded-[50%] border border-hair object-cover" />
              )}
              {uit?.huid && <span className="inline-flex items-center gap-1.5 text-[12px] text-neutralx-600"><span className="h-5 w-5 rounded-full border border-hair" style={{ background: uit.huid }} aria-hidden />{p.huid}</span>}
              {uit?.haarKleur && <span className="inline-flex items-center gap-1.5 text-[12px] text-neutralx-600"><span className="h-5 w-5 rounded-full border border-hair" style={{ background: uit.haarKleur }} aria-hidden />{p.haarTitel}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[12px] font-semibold text-ink">
                {p.borst} (cm)
                <input inputMode="numeric" value={borst} onChange={(e) => setBorst(e.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-hairstrong px-2 text-[14px] font-semibold" />
              </label>
              <label className="text-[12px] font-semibold text-ink">
                {p.taille} (cm)
                <input inputMode="numeric" value={taille} onChange={(e) => setTaille(e.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-hairstrong px-2 text-[14px] font-semibold" />
              </label>
              <label className="text-[12px] font-semibold text-ink">
                {p.lengte} (cm)
                <input
                  inputMode="numeric"
                  value={lengte}
                  onChange={(e) => setLengte(getal(e.target.value, 90, 215) ?? lengte)}
                  onBlur={() => bestand && !fout && void meet(bestand, lengte)}
                  className="mt-1 block h-9 w-full rounded-lg border border-hairstrong px-2 text-[14px] font-semibold"
                />
              </label>
            </div>
            {uit && <p className="text-[11px] text-neutralx-500">{p.pasFotoGeschat}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <input ref={invoer} type="file" accept="image/*" className="sr-only" aria-label={p.pasFotoKies} onChange={(e) => kies(e.target.files?.[0])} />
          <button type="button" onClick={() => invoer.current?.click()} disabled={stap !== ""} className="h-10 rounded-lg border border-hairstrong px-3.5 text-[13px] font-semibold text-ink hover:bg-paper-soft disabled:opacity-50">
            {uit ? p.pasFotoAndere : p.pasFotoKies}
          </button>
          {((uit && !probleem) || fout) && (
            <button
              type="button"
              onClick={() => onToepassen({ lengte, borst: getal(borst, 60, 160), taille: getal(taille, 50, 160), huid: uit?.huid ?? null, haarKleur: uit?.haarKleur ?? null, gezicht: uit?.gezicht ?? null })}
              className="h-10 flex-1 rounded-lg bg-brand-500 px-4 text-[13px] font-bold text-white hover:bg-brand-600"
            >
              {p.pasFotoToepassen}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
