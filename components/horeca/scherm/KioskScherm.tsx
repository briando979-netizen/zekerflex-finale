"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { euro } from "@/lib/horeca/weergave";
import { leesOpties, type Gekozen } from "@/lib/horeca/opties";
import { KeuzeVenster } from "@/components/horeca/live/KeuzeVenster";
import { Knop, type SchermProps } from "@/components/horeca/scherm/ui";

// ---------------------------------------------------------------------------
// De zelfbestelzuil (tablet, staand, 15 nov 2026): gasten kiezen zelf van de
// kaart, kiezen hier opeten of meenemen en krijgen een nummer. Betalen gebeurt
// aan de balie (de kassa ziet de bestelling); het afhaalscherm toont wanneer
// het klaar is. Geen namen of andere bestellingen in beeld. Wordt de zuil een
// tijd niet aangeraakt, dan begint hij weer leeg.
// ---------------------------------------------------------------------------

interface OptieRegel {
  sleutel: string;
  itemId: string;
  aantal: number;
  opties: Gekozen[];
  tekst: string;
  prijsCent: number;
}

const STIL_MS = 120_000;
const NUMMER_MS = 20_000;

export function KioskScherm({ data, doe, nu }: SchermProps) {
  const items = useMemo(() => (data.items ?? []).filter((i) => i.beschikbaar), [data.items]);
  const cats = useMemo(() => (data.categorieen ?? []).filter((c) => items.some((i) => i.categorieId === c.id)), [data.categorieen, items]);
  const [cat, setCat] = useState<string>("alles");
  const [mand, setMand] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<OptieRegel[]>([]);
  const [kiezen, setKiezen] = useState<(typeof items)[number] | null>(null);
  const [afronden, setAfronden] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [nummer, setNummer] = useState<{ n: number; op: number } | null>(null);
  const laatst = useRef(Date.now());

  const regels = Object.entries(mand).filter(([, n]) => n > 0);
  const aantal = regels.reduce((s, [, n]) => s + n, 0) + extra.reduce((s, x) => s + x.aantal, 0);
  const totaal = regels.reduce((s, [id, n]) => s + (items.find((i) => i.id === id)?.prijsCent ?? 0) * n, 0) + extra.reduce((s, x) => s + x.prijsCent * x.aantal, 0);
  const zichtbaar = items.filter((i) => cat === "alles" || i.categorieId === cat);
  const aantalVan = (id: string) => (mand[id] ?? 0) + extra.filter((x) => x.itemId === id).reduce((s, x) => s + x.aantal, 0);

  function leeg() {
    setMand({});
    setExtra([]);
    setAfronden(false);
    setKiezen(null);
    setCat("alles");
  }

  // stil = opnieuw beginnen; het nummer verdwijnt vanzelf
  useEffect(() => {
    const raak = () => {
      laatst.current = Date.now();
    };
    window.addEventListener("pointerdown", raak);
    return () => window.removeEventListener("pointerdown", raak);
  }, []);
  useEffect(() => {
    if (nummer && nu - nummer.op > NUMMER_MS) setNummer(null);
    if (aantal > 0 && Date.now() - laatst.current > STIL_MS) {
      setMand({});
      setExtra([]);
      setAfronden(false);
      setKiezen(null);
      setCat("alles");
    }
  }, [nu, nummer, aantal]);

  async function bestel(hier: boolean) {
    setBezig(true);
    const uit = await doe({ actie: "kiosk-bestelling", hier, mand: [...regels.map(([itemId, n]) => ({ itemId, aantal: n })), ...extra.map((x) => ({ itemId: x.itemId, aantal: x.aantal, opties: x.opties }))] });
    setBezig(false);
    if (uit && typeof uit.nummer === "number") {
      leeg();
      setNummer({ n: uit.nummer, op: Date.now() });
    }
  }

  if (nummer) {
    return (
      <div className="grid min-h-[80vh] place-items-center p-6 text-center">
        <div role="status" aria-live="assertive">
          <p className="text-2xl font-semibold text-[#B8C4BD]">Je nummer</p>
          <p className="mt-2 font-display text-[clamp(6rem,30vw,14rem)] font-bold leading-none text-white">{nummer.n}</p>
          <p className="mt-6 text-2xl font-bold text-[#86EFAC]">Betaal aan de balie</p>
          <p className="mt-2 text-lg text-[#B8C4BD]">Op het scherm zie je wanneer je bestelling klaar is.</p>
          <Knop soort="doen" groot className="mt-8" onClick={() => setNummer(null)}>
            Klaar
          </Knop>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[85vh] flex-col p-3 sm:p-5">
      <h2 className="font-display text-3xl font-bold text-white">Bestel hier zelf</h2>
      {cats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Categorie">
          {[{ id: "alles", naam: "Alles" }, ...cats].map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={`rounded-xl px-4 py-3 text-lg font-bold ${cat === c.id ? "bg-[#22C55E] text-[#04130A]" : "text-[#B8C4BD] ring-1 ring-white/15"}`}>
              {c.naam}
            </button>
          ))}
        </div>
      )}
      <ul className="mt-4 grid flex-1 content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {zichtbaar.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => (leesOpties(i.opties).length ? setKiezen(i) : setMand((m) => ({ ...m, [i.id]: Math.min(50, (m[i.id] ?? 0) + 1) })))}
              className="relative flex h-32 w-full flex-col justify-between rounded-2xl bg-white/[0.06] p-4 text-left ring-1 ring-white/10 active:scale-[0.98]"
              aria-label={`${i.naam}, ${euro(i.prijsCent)}, erbij`}
            >
              <span className="line-clamp-2 text-xl font-bold text-white">{i.naam}</span>
              <span className="text-lg text-[#B8C4BD]">{euro(i.prijsCent)}</span>
              {aantalVan(i.id) > 0 && <span className="absolute right-3 top-3 grid h-9 min-w-9 place-items-center rounded-full bg-[#22C55E] px-2 text-lg font-bold text-[#04130A]">{aantalVan(i.id)}</span>}
            </button>
          </li>
        ))}
      </ul>

      {aantal > 0 && (
        <section aria-label="Je bestelling" className="sticky bottom-0 mt-4 rounded-2xl bg-[#141A17] p-4 ring-1 ring-white/10">
          {!afronden ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl font-bold text-white">
                {aantal} {aantal === 1 ? "artikel" : "artikelen"} · {euro(totaal)}
              </p>
              <div className="flex gap-2">
                <Knop soort="stil" groot onClick={leeg}>
                  Opnieuw
                </Knop>
                <Knop soort="doen" groot onClick={() => setAfronden(true)}>
                  Bestellen
                </Knop>
              </div>
            </div>
          ) : (
            <div>
              <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto text-lg text-white">
                {regels.map(([id, n]) => (
                  <li key={id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {n}× {items.find((x) => x.id === id)?.naam}
                    </span>
                    <button type="button" onClick={() => setMand((m) => ({ ...m, [id]: Math.max(0, (m[id] ?? 0) - 1) }))} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 font-bold" aria-label={`Eén ${items.find((x) => x.id === id)?.naam ?? ""} minder`}>
                      −
                    </button>
                  </li>
                ))}
                {extra.map((x) => (
                  <li key={x.sleutel} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {x.aantal}× {items.find((i) => i.id === x.itemId)?.naam} <span className="text-sm text-[#B8C4BD]">{x.tekst}</span>
                    </span>
                    <button type="button" onClick={() => setExtra((e) => (x.aantal > 1 ? e.map((y) => (y === x ? { ...y, aantal: y.aantal - 1 } : y)) : e.filter((y) => y !== x)))} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 font-bold" aria-label="Eén minder">
                      −
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xl font-bold text-white">Totaal {euro(totaal)} · je betaalt aan de balie</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Knop soort="doen" groot disabled={bezig} onClick={() => void bestel(true)}>
                  Hier opeten
                </Knop>
                <Knop soort="doen" groot disabled={bezig} onClick={() => void bestel(false)}>
                  Meenemen
                </Knop>
              </div>
              <button type="button" onClick={() => setAfronden(false)} className="mt-3 text-base font-semibold text-[#B8C4BD] underline">
                Nog iets erbij
              </button>
            </div>
          )}
        </section>
      )}

      {kiezen && (
        <KeuzeVenster
          naam={kiezen.naam}
          prijsCent={kiezen.prijsCent}
          groepen={leesOpties(kiezen.opties)}
          donker
          sluit={() => setKiezen(null)}
          kies={(g) => {
            const item = kiezen;
            setKiezen(null);
            setExtra((e) => {
              const zelfde = e.find((x) => x.itemId === item.id && x.tekst === g.tekst);
              if (zelfde) return e.map((x) => (x === zelfde ? { ...x, aantal: Math.min(50, x.aantal + 1) } : x));
              return [...e, { sleutel: `${item.id}-${e.length}-${g.tekst}`, itemId: item.id, aantal: 1, opties: g.opties, tekst: g.tekst, prijsCent: g.prijsCent }];
            });
          }}
        />
      )}
    </div>
  );
}
