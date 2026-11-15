"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { kaartBeeld, momentVan, toonVan, type BordBestelling, type BordToon } from "@/lib/horeca/bord";
import { tijdTekst } from "@/lib/horeca/bezorgen";
import { inNederland, TEGEL } from "@/lib/kaart/voorbeeld";
import { TOON_STIJL, TOON_VOLGORDE } from "@/components/horeca/beheer/bord-stijl";

// De bestellingenkaart (horeca, 15 nov 2026): de zaak en alle open bezorgingen in één beeld, op onze eigen
// straatkaarttegels (/api/kaart/straat: PDOK, alleen Nederland, geen externe partij in de browser). Een speld
// heeft de kleur van het bord (bord-stijl.ts) en opent de bestelling. Tekst in lib/i18n (horecaBord).

export interface KaartItem extends BordBestelling {
  id: string;
  nummer: number;
  lat: number | null;
  lng: number | null;
}

const HOOGTE = 420;

export function BestelKaart({ lijst, zaak, nu, kies }: { lijst: KaartItem[]; zaak: { lat: number; lng: number } | null; nu: number; kies: (id: string) => void }) {
  const t = useT().horecaBord;
  const vak = useRef<HTMLDivElement>(null);
  const [breedte, setBreedte] = useState(0);
  useEffect(() => {
    const el = vak.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setBreedte(Math.round(e[0]?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const open = lijst.filter((b): b is KaartItem & { lat: number; lng: number } => b.soort === "bezorgen" && !b.afgeleverdOp && b.status !== "GEANNULEERD" && typeof b.lat === "number" && typeof b.lng === "number" && inNederland(b.lat, b.lng));
  const zaakOpKaart = zaak && inNederland(zaak.lat, zaak.lng) ? zaak : null;
  const punten = [...(zaakOpKaart ? [zaakOpKaart] : []), ...open.map((b) => ({ lat: b.lat, lng: b.lng }))];
  const beeld = breedte > 0 ? kaartBeeld(punten, breedte, HOOGTE) : null;
  const plekVan = (i: number) => beeld?.punten[i + (zaakOpKaart ? 1 : 0)];
  const legenda: Record<BordToon, string> = { wacht: t.legWacht, gepland: t.legGepland, onderweg: t.legOnderweg, laat: t.teLaat, af: "" };

  return (
    <section className="card space-y-3 p-4" aria-labelledby="bestelkaart-kop">
      <div>
        <h2 id="bestelkaart-kop" className="font-display text-lg font-bold text-ink">
          {t.kaartKop}
        </h2>
        <p className="text-sm text-neutralx-600">{open.length ? t.kaartUitleg : t.kaartLeeg}</p>
      </div>
      <div ref={vak} className="relative w-full overflow-hidden rounded-xl bg-neutralx-50" style={{ height: HOOGTE }}>
        {beeld?.tegels.map((g) => (
          // eslint-disable-next-line @next/next/no-img-element -- eigen tegels via /api/kaart/straat, geen beeldoptimalisatie nodig
          <img
            key={`${beeld.zoom}-${g.x}-${g.y}`}
            src={`/api/kaart/straat/${beeld.zoom}/${g.x}/${g.y}.png`}
            alt=""
            width={TEGEL}
            height={TEGEL}
            loading="lazy"
            className="absolute max-w-none select-none"
            style={{ left: g.links, top: g.boven, width: TEGEL, height: TEGEL }}
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />
        ))}
        {zaakOpKaart && beeld?.punten[0] && (
          <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md bg-ink px-2 py-1 text-xs font-bold text-white shadow" style={{ left: beeld.punten[0].x, top: beeld.punten[0].y }}>
            {t.kaartZaak}
          </span>
        )}
        {open.map((b, i) => {
          const p = plekVan(i);
          if (!p) return null;
          const toon = toonVan(b, nu);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => kies(b.id)}
              aria-label={t.kaartSpeld.replace("{nummer}", String(b.nummer)).replace("{tijd}", tijdTekst(momentVan(b)))}
              className={`absolute -translate-x-1/2 -translate-y-full rounded-full px-2 py-1 text-xs font-bold shadow ${TOON_STIJL[toon]}`}
              style={{ left: p.x, top: p.y }}
            >
              #{b.nummer} · {tijdTekst(momentVan(b))}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutralx-600">
        <ul className="flex flex-wrap gap-2" aria-label={t.legenda}>
          {TOON_VOLGORDE.map((k) => (
            <li key={k} className={`rounded-full px-2 py-0.5 font-semibold ${TOON_STIJL[k]}`}>
              {legenda[k]}
            </li>
          ))}
        </ul>
        <span>{t.toeschrijving}</span>
      </div>
    </section>
  );
}
