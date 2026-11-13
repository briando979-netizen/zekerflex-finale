"use client";

import { useEffect, useId, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

// Echt passen op de eigen foto (lib/shop/pasdienst.ts). Alleen zichtbaar als de echte paskamer aan staat, er een foto
// is én een kledingstuk aan. Er gaat pas iets weg na het vinkje, en dan alleen deze ene, verkleinde foto. Het beeld
// komt terug als data-URI en wordt alleen getoond (niet bewaard). Lukt het niet: een eerlijke melding en de paspop.

const MAX_B = 864;
const MAX_H = 1296;

/** De foto verkleinen tot wat de pasdienst gebruikt (864 × 1296) en als JPEG: klein genoeg voor de openbare grens van 1 MB. */
async function verklein(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const im = new Image();
    await new Promise<void>((ok, nee) => {
      im.onload = () => ok();
      im.onerror = () => nee(new Error("foto laden"));
      im.src = url;
    });
    const schaal = Math.min(1, MAX_B / im.naturalWidth, MAX_H / im.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(im.naturalWidth * schaal));
    c.height = Math.max(1, Math.round(im.naturalHeight * schaal));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("geen canvas");
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function EchtPassen({ bestand, kleding, onBeeld }: { bestand: File | null; kleding: { id: string; naam: string } | null; onBeeld: (beeld: string | null) => void }) {
  const p = useT().paskamer;
  const vinkId = useId();
  const [aan, setAan] = useState(false);
  const [akkoord, setAkkoord] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  useEffect(() => {
    let weg = false;
    void fetch("/api/shop/paskamer/passen", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { aan?: boolean } | null) => {
        if (!weg) setAan(Boolean(d?.aan));
      })
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, []);

  if (!aan || !bestand) return null;

  const pas = async () => {
    if (!kleding || !akkoord) return;
    setBezig(true);
    setFout("");
    try {
      const foto = await verklein(bestand);
      const r = await fetch("/api/shop/paskamer/passen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: kleding.id, foto, toestemming: true }),
      });
      const d = (await r.json().catch(() => ({}))) as { beeld?: string; error?: { message?: string } };
      if (r.ok && typeof d.beeld === "string" && d.beeld.startsWith("data:image/")) onBeeld(d.beeld);
      else setFout(d.error?.message ?? p.echtMislukt);
    } catch {
      setFout(p.echtMislukt);
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="relative space-y-2 rounded-xl border border-hair bg-paper-soft p-3">
      <p className="text-[13px] font-bold text-ink">{p.echtTitel}</p>
      {kleding ? (
        <>
          <p className="text-[12px] text-neutralx-600">{p.echtUitleg.replace("{naam}", kleding.naam)}</p>
          <div className="flex items-start gap-2">
            <input id={vinkId} type="checkbox" checked={akkoord} onChange={(e) => setAkkoord(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <label htmlFor={vinkId} className="text-[12px] leading-snug text-neutralx-600">
              {p.echtToestemming}
            </label>
          </div>
          {fout && (
            <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-[12px] font-semibold text-crit">
              {fout}
            </p>
          )}
          <button type="button" onClick={() => void pas()} disabled={!akkoord || bezig} className="h-10 w-full rounded-lg bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50">
            {bezig ? p.echtBezig : p.echtKnop}
          </button>
          {bezig && (
            <p role="status" className="sr-only">
              {p.echtBezig}
            </p>
          )}
        </>
      ) : (
        <p className="text-[12px] text-neutralx-600">{p.echtEerstKleding}</p>
      )}
    </div>
  );
}
