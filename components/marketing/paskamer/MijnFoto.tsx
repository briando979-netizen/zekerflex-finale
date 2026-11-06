"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

// "Op mijn foto": de klant uploadt een foto van zichzelf (hele lichaam) en de
// producten die in de paskamer aan staan worden door het beeldmodel op die
// persoon gezet. De foto wordt hier verkleind (zonder metadata) en alleen na
// uitdrukkelijke toestemming eenmalig verstuurd; hij wordt nergens bewaard.

export type PasRegel = { id: string; maat: string | null; kleur: string | null; naam: string };

/** Foto in de browser verkleinen tot een jpeg van maximaal 1280 px (draait mee met de camerastand, geen EXIF/GPS). */
async function verklein(bestand: File): Promise<string> {
  const bmp = await createImageBitmap(bestand);
  const f = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * f);
  c.height = Math.round(bmp.height * f);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.86);
}

export function MijnFoto({ regels }: { regels: PasRegel[] }) {
  const p = useT().paskamer;
  const [foto, setFoto] = useState<string | null>(null);
  const [akkoord, setAkkoord] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<string | null>(null);
  const [fout, setFout] = useState("");
  const [secs, setSecs] = useState(0);
  const inVoerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!bezig) return;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [bezig]);

  const kies = async (f: File | undefined) => {
    if (!f) return;
    setFout("");
    setUitkomst(null);
    try {
      setFoto(await verklein(f));
    } catch {
      setFout(p.pasFotoOngeldig);
    }
  };

  const pas = async () => {
    if (!foto || !akkoord || regels.length === 0) return;
    setBezig(true);
    setFout("");
    try {
      const res = await fetch("/api/shop/pas-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto, akkoord: true, producten: regels.slice(0, 5).map((r) => ({ id: r.id, ...(r.maat ? { maat: r.maat } : {}), ...(r.kleur ? { kleur: r.kleur } : {}) })) }),
      });
      const d = (await res.json().catch(() => ({}))) as { image?: string; error?: { message?: string } };
      if (!res.ok || !d.image) {
        setFout(d.error?.message ?? p.pasFotoMislukt);
        return;
      }
      setUitkomst(d.image);
    } catch {
      setFout(p.pasFotoMislukt);
    } finally {
      setBezig(false);
    }
  };

  const bewaar = () => {
    if (!uitkomst) return;
    const a = document.createElement("a");
    a.href = uitkomst;
    a.download = "ik-in-zekerflex-kleding.jpg";
    a.click();
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {uitkomst ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL uit het model
          <img src={uitkomst} alt={p.pasFotoUitkomst} className="mx-auto max-h-full w-auto max-w-full rounded-xl object-contain" />
        ) : foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- lokale foto van de klant
          <img src={foto} alt={p.pasFotoJouw} className="mx-auto max-h-full w-auto max-w-full rounded-xl object-contain" />
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
            {fout}
          </p>
        )}
        {foto && !uitkomst && (
          <label className="flex items-start gap-2.5 text-[12px] leading-snug text-neutralx-700">
            <input type="checkbox" checked={akkoord} onChange={(e) => setAkkoord(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500" />
            {p.pasFotoAkkoord}
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <input ref={inVoerRef} type="file" accept="image/*" className="sr-only" aria-label={p.pasFotoKies} onChange={(e) => void kies(e.target.files?.[0])} />
          <button type="button" onClick={() => inVoerRef.current?.click()} className="h-10 rounded-lg border border-hairstrong px-3.5 text-[13px] font-semibold text-ink hover:bg-paper-soft">
            {foto ? p.pasFotoAndere : p.pasFotoKies}
          </button>
          {foto && !uitkomst && (
            <button
              type="button"
              onClick={() => void pas()}
              disabled={!akkoord || bezig || regels.length === 0}
              className="h-10 flex-1 rounded-lg bg-brand-500 px-4 text-[13px] font-bold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {bezig ? `${p.pasFotoBezig} ${secs}s` : regels.length === 0 ? p.pasFotoKiesEerst : p.pasFotoKnop}
            </button>
          )}
          {uitkomst && (
            <>
              <button type="button" onClick={() => setUitkomst(null)} className="h-10 rounded-lg border border-hairstrong px-3.5 text-[13px] font-semibold text-ink hover:bg-paper-soft">
                {p.pasFotoOpnieuw}
              </button>
              <button type="button" onClick={bewaar} className="h-10 flex-1 rounded-lg bg-brand-500 px-4 text-[13px] font-bold text-white hover:bg-brand-600">
                {p.bewaar}
              </button>
            </>
          )}
        </div>
        {uitkomst && <p className="text-[11px] text-neutralx-500">{p.pasFotoKanAfwijken}</p>}
      </div>
    </div>
  );
}
