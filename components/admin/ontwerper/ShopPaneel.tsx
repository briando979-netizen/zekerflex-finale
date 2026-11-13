"use client";

import { useEffect, useState } from "react";
import { SHOP_SECTIES, isStandaardShopIndeling, normalizeShopIndeling, type ShopIndeling, type ShopSectieId } from "@/lib/ontwerp/shop-indeling";
import { SleepGreep, useSleep } from "@/components/admin/ontwerper/Sleep";
import { verplaatsNaar } from "@/lib/ontwerp/sleep";

// ---------------------------------------------------------------------------
// Tabblad Webshop: de onderdelen van /shop onder de kop verslepen en verbergen. "Opslaan" zet de indeling meteen live;
// "Standaard" zet de oorspronkelijke indeling terug. Een indeling gelijk aan de standaard wordt niet bewaard.
// Producten, prijzen en foto's beheer je in Beheer → Webshop; dit tabblad gaat alleen over de indeling van de pagina.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const verborgenStijl = { background: "var(--a-elev)", border: "1px dashed var(--a-border)" };
const mute = { color: "var(--a-mute)" };
const klein = "grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-xs disabled:opacity-30";
const knopStijl = { background: "var(--a-elev)", color: "var(--a-text)" };
const INFO = new Map<string, (typeof SHOP_SECTIES)[number]>(SHOP_SECTIES.map((s) => [s.id, s]));
const gelijk = (a: ShopIndeling, b: ShopIndeling) => JSON.stringify(normalizeShopIndeling(a)) === JSON.stringify(normalizeShopIndeling(b));

type Antwoord = { indeling?: ShopIndeling; eigen?: boolean; error?: { message?: string } };

async function stuur(init?: RequestInit): Promise<Antwoord> {
  const r = await fetch("/api/admin/ontwerp/shop", { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  const d = (await r.json().catch(() => null)) as Antwoord | null;
  if (!r.ok || !d?.indeling) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d;
}

export function ShopPaneel({ onVoorbeeldPad, onVernieuw }: { onVoorbeeldPad: (pad: string | null) => void; onVernieuw: () => void }) {
  const [indeling, setIndeling] = useState<ShopIndeling | null>(null);
  const [live, setLive] = useState<ShopIndeling | null>(null);
  const [eigen, setEigen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  // het voorbeeld toont de webshop zolang dit tabblad open is
  useEffect(() => {
    onVoorbeeldPad("/shop");
    return () => onVoorbeeldPad(null);
  }, [onVoorbeeldPad]);

  useEffect(() => {
    stuur()
      .then((d) => {
        setIndeling(d.indeling ?? null);
        setLive(d.indeling ?? null);
        setEigen(Boolean(d.eigen));
      })
      .catch((e: Error) => setMelding({ tekst: e.message, fout: true }));
  }, []);

  // een hook hoort boven de vroege return hieronder; zonder indeling valt er niets te verslepen
  const sleep = useSleep((van, naar) => {
    if (indeling) zet({ ...indeling, volgorde: verplaatsNaar(indeling.volgorde, van, naar) });
  });

  if (!indeling || !live) {
    return melding ? (
      <p role="alert" className="text-sm" style={{ color: "var(--a-crit)" }}>
        {melding.tekst}
      </p>
    ) : (
      <p className="text-sm" style={mute}>
        Laden…
      </p>
    );
  }

  function zet(n: ShopIndeling) {
    setIndeling(n);
    setMelding(null);
  }

  const verborgen = new Set<string>(indeling.verborgen);
  const toon = (id: ShopSectieId, aan: boolean) => zet({ ...indeling, verborgen: aan ? indeling.verborgen.filter((x) => x !== id) : [...indeling.verborgen, id] });
  const gewijzigd = !gelijk(indeling, live);

  async function opslaan() {
    if (!indeling) return;
    setBezig(true);
    setMelding(null);
    try {
      const d = await stuur({ method: "PUT", body: JSON.stringify({ indeling }) });
      setIndeling(d.indeling ?? null);
      setLive(d.indeling ?? null);
      setEigen(Boolean(d.eigen));
      setMelding({ tekst: "Opgeslagen. De webshop toont nu deze indeling." });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: (e as Error).message, fout: true });
    } finally {
      setBezig(false);
    }
  }

  async function standaard() {
    if (!window.confirm("De indeling van de webshop terugzetten naar de standaard?")) return;
    setBezig(true);
    setMelding(null);
    try {
      const d = await stuur({ method: "DELETE" });
      setIndeling(d.indeling ?? null);
      setLive(d.indeling ?? null);
      setEigen(false);
      setMelding({ tekst: "De webshop heeft weer de standaardindeling." });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: (e as Error).message, fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-xl p-3" style={paneel}>
        <h3 className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
          Indeling van de webshop
        </h3>
        <p className="text-[11px]" style={mute}>
          Sleep een onderdeel naar een andere plek (pak het bij ⠿) of gebruik de pijltjes. Haal het vinkje weg om het te verbergen. Wie in de shop zoekt of een categorie kiest, ziet alleen
          het assortiment en wat eronder staat.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void opslaan()} disabled={bezig || !gewijzigd} className="a-button a-button-primary text-xs disabled:opacity-50">
            {bezig ? "Bezig…" : "Opslaan (meteen live)"}
          </button>
          <button type="button" onClick={() => void standaard()} disabled={bezig || (!eigen && isStandaardShopIndeling(indeling))} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={knopStijl}>
            Standaard
          </button>
          {gewijzigd ? (
            <span className="text-[11px]" style={mute}>
              Nog niet opgeslagen
            </span>
          ) : null}
        </div>
        {melding ? (
          <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
            {melding.tekst}
          </p>
        ) : null}
      </section>

      <ol className="space-y-1.5" aria-label="Onderdelen van de webshop, van boven naar beneden" {...sleep.lijst}>
        <li className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
          <span className="font-semibold" style={{ color: "var(--a-text)" }}>
            Kop met vier producten
          </span>
          <span style={mute}>staat altijd bovenaan</span>
        </li>
        {indeling.volgorde.map((id, i) => {
          const info = INFO.get(id);
          const vast = Boolean(info && "vast" in info && info.vast);
          const aan = !verborgen.has(id);
          return (
            // verborgen: gestippelde rand en een andere achtergrond (geen doorzichtigheid: de tekst moet leesbaar blijven)
            <li key={id} data-sleep-rij="" className="flex items-center gap-2 rounded-xl px-3 py-2" style={aan ? paneel : verborgenStijl}>
              <SleepGreep naam={info?.naam ?? id} />
              <label className="flex min-w-0 flex-1 items-start gap-2">
                <input type="checkbox" checked={aan} disabled={vast} onChange={(e) => toon(id, e.target.checked)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold" style={{ color: "var(--a-text)" }}>
                    {info?.naam ?? id}
                    {aan ? "" : " (verborgen)"}
                  </span>
                  <span className="block text-[11px]" style={mute}>
                    {info?.uitleg}
                  </span>
                </span>
              </label>
              <button type="button" onClick={() => zet({ ...indeling, volgorde: verplaatsNaar(indeling.volgorde, i, i - 1) })} disabled={i === 0} aria-label={`${info?.naam ?? id} omhoog`} className={klein} style={knopStijl}>
                ↑
              </button>
              <button type="button" onClick={() => zet({ ...indeling, volgorde: verplaatsNaar(indeling.volgorde, i, i + 1) })} disabled={i === indeling.volgorde.length - 1} aria-label={`${info?.naam ?? id} omlaag`} className={klein} style={knopStijl}>
                ↓
              </button>
            </li>
          );
        })}
      </ol>

      <p className="text-[11px]" style={mute}>
        Producten, prijzen, foto&apos;s en collecties beheer je in Beheer → Webshop. De teksten van de voorpagina van de webshop staan in het tabblad Teksten, onder Webshop. Een eigen tekst geldt voor de Nederlandse shop; de Engelse versie houdt zijn vertaling.
      </p>
    </div>
  );
}
