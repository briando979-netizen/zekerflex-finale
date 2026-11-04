"use client";

import { useMemo, useState } from "react";
import { euro } from "@/lib/horeca/weergave";
import { centVan } from "@/components/rijschool/api";
import { fooiOpties, rekeningVan, totaalVan, verdeelGelijk, wisselgeld, type Methode, type RekeningRegel } from "@/lib/horeca/kassa";
import type { BonData, SchermBestelling, SchermData } from "@/components/horeca/live/types";
import { BonVenster } from "@/components/horeca/live/Bon";
import { KeuzeVenster } from "@/components/horeca/live/KeuzeVenster";
import { leesOpties, type Gekozen } from "@/lib/horeca/opties";
import { Knop, Leeg, type SchermDoe, type SchermProps } from "@/components/horeca/scherm/ui";

// ---------------------------------------------------------------------------
// De kassa (tablet of pc, liggend). Links alle open rekeningen: tafels en
// bestellingen zonder tafel. In het midden de rekening: alles, per gerecht
// (kies wat er betaald wordt) of gelijk verdelen. Rechts fooi, pin of contant
// met wisselgeld, en afrekenen; daarna de bon om te printen. Plus snelle
// verkoop: kiezen en meteen afrekenen aan de bar of balie.
// ---------------------------------------------------------------------------

type Keuze = { soort: "tafel"; id: string; naam: string } | { soort: "bestelling"; id: string; naam: string } | { soort: "verkoop" };
type Splits = "alles" | "gerecht" | "gelijk";
const sleutel = (r: Pick<RekeningRegel, "bestellingId" | "index">) => `${r.bestellingId}:${r.index}`;

function Rekeningen({ data, keuze, kies }: { data: SchermData; keuze: Keuze | null; kies: (k: Keuze) => void }) {
  const zaal = (data.zaal ?? []).filter((t) => t.openCent > 0);
  const balie = (data.bestellingen ?? []).filter((b) => b.tafelId === null && !b.betaald && b.status !== "GEANNULEERD");
  const actief = (k: Keuze) => keuze !== null && keuze.soort === k.soort && (k.soort === "verkoop" || (keuze.soort !== "verkoop" && keuze.id === k.id));
  const knop = (k: Keuze, titel: string, onder: string, bedrag: number, aandacht = false) => (
    <button type="button" aria-pressed={actief(k)} onClick={() => kies(k)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left ring-1 ${actief(k) ? "bg-white text-[#0B0F0D] ring-white" : aandacht ? "bg-[#3A2203] text-white ring-[#F59E0B]" : "bg-white/[0.05] text-white ring-white/10 hover:bg-white/10"}`}>
      <span className="min-w-0">
        <span className="block truncate text-base font-bold">{titel}</span>
        <span className={`block truncate text-xs ${actief(k) ? "text-[#4B5563]" : "text-[#B8C4BD]"}`}>{onder}</span>
      </span>
      <span className="flex-shrink-0 font-display text-lg font-bold tabular-nums">{euro(bedrag)}</span>
    </button>
  );
  return (
    <nav aria-label="Open rekeningen" className="space-y-2">
      <Knop groot soort="doen" className="w-full" aria-pressed={keuze?.soort === "verkoop"} onClick={() => kies({ soort: "verkoop" })}>
        + Snelle verkoop
      </Knop>
      <h2 className="pt-2 text-xs font-bold uppercase tracking-[0.14em] text-[#9BA8A1]">Open rekeningen</h2>
      {zaal.length === 0 && balie.length === 0 && <p className="text-sm text-[#9BA8A1]">Niets open.</p>}
      <ul className="space-y-2">
        {zaal.map((t) => (
          <li key={t.id}>{knop({ soort: "tafel", id: t.id, naam: t.naam }, t.naam, t.oproep === "rekening" ? "Wil afrekenen" : `${t.openBestellingen ? "nog in de maak · " : ""}${t.sindsMin ?? 0} min aan tafel`, t.openCent, t.oproep === "rekening")}</li>
        ))}
        {balie.map((b) => (
          <li key={b.id}>{knop({ soort: "bestelling", id: b.id, naam: `#${b.nummer}` }, `#${b.nummer} · balie`, b.naam || (b.bron === "qr" ? "via QR" : "zonder tafel"), b.totaalCent)}</li>
        ))}
      </ul>
    </nav>
  );
}

function Betalen({ te, fooiAan, doeBetaal, bezig }: { te: number; fooiAan: boolean; doeBetaal: (m: Methode, fooiCent: number) => void; bezig: boolean }) {
  const [fooi, setFooi] = useState(0);
  const [eigenFooi, setEigenFooi] = useState("");
  const [methode, setMethode] = useState<Methode>("pin");
  const [gegeven, setGegeven] = useState("");
  const totaal = te + (fooiAan ? fooi : 0);
  const gegevenCent = centVan(gegeven);
  const terug = gegevenCent === null ? null : wisselgeld(totaal, gegevenCent);
  const biljetten = [...new Set([totaal, Math.ceil(totaal / 500) * 500, Math.ceil(totaal / 1000) * 1000, Math.ceil(totaal / 2000) * 2000, Math.ceil(totaal / 5000) * 5000])].filter((b) => b >= totaal).slice(0, 4);
  return (
    <section aria-label="Betalen" className="space-y-4 rounded-2xl bg-[#141A17] p-4 ring-1 ring-white/10">
      {fooiAan && (
        <div>
          <p className="text-sm font-semibold text-[#B8C4BD]">Fooi</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Fooi">
            <button type="button" aria-pressed={fooi === 0} onClick={() => {
                setFooi(0);
                setEigenFooi("");
              }} className={`rounded-lg px-3 py-2 text-sm font-bold ${fooi === 0 ? "bg-white text-[#0B0F0D]" : "bg-white/10 text-white"}`}>
              Geen
            </button>
            {fooiOpties(te).map((o) => (
              <button key={o.label} type="button" aria-pressed={fooi === o.fooiCent} onClick={() => {
                  setFooi(o.fooiCent);
                  setEigenFooi("");
                }} className={`rounded-lg px-3 py-2 text-sm font-bold ${fooi === o.fooiCent ? "bg-[#F5C451] text-[#241703]" : "bg-white/10 text-white"}`}>
                {o.label} <span className="font-normal opacity-80">+{euro(o.fooiCent)}</span>
              </button>
            ))}
            <label className="flex items-center gap-1 text-sm text-[#B8C4BD]">
              <span className="sr-only">Eigen fooi in euro</span>€
              <input
                inputMode="decimal"
                value={eigenFooi}
                placeholder="anders"
                onChange={(e) => {
                  setEigenFooi(e.target.value);
                  setFooi(centVan(e.target.value) ?? 0);
                }}
                className="w-20 rounded-lg border-0 bg-white/10 px-2 py-2 text-white placeholder:text-[#9BA8A1] focus:outline-none focus:ring-2 focus:ring-[#F5C451]"
              />
            </label>
          </div>
        </div>
      )}
      <div role="group" aria-label="Betaalwijze" className="grid grid-cols-2 gap-2">
        {(["pin", "contant"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={methode === m} onClick={() => setMethode(m)} className={`min-h-14 rounded-xl text-lg font-bold ${methode === m ? "bg-white text-[#0B0F0D]" : "bg-white/10 text-white ring-1 ring-white/15"}`}>
            {m === "pin" ? "Pin" : "Contant"}
          </button>
        ))}
      </div>
      {methode === "contant" && (
        <div>
          <p className="text-sm font-semibold text-[#B8C4BD]">Gegeven</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {biljetten.map((b) => (
              <button key={b} type="button" onClick={() => setGegeven((b / 100).toFixed(2).replace(".", ","))} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold text-white">
                {b === totaal ? "Gepast" : euro(b)}
              </button>
            ))}
            <label className="flex items-center gap-1 text-sm text-[#B8C4BD]">
              <span className="sr-only">Gegeven bedrag in euro</span>€
              <input inputMode="decimal" value={gegeven} onChange={(e) => setGegeven(e.target.value)} className="w-24 rounded-lg border-0 bg-white/10 px-2 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#22C55E]" />
            </label>
          </div>
          {terug !== null && (
            <p className="mt-3 rounded-xl bg-[#33260A] px-3 py-2 text-xl font-bold text-[#F5C451]" role="status">
              Wisselgeld {euro(terug)}
            </p>
          )}
        </div>
      )}
      <Knop groot soort="doen" className="w-full text-xl" disabled={bezig || te <= 0} onClick={() => doeBetaal(methode, fooiAan ? fooi : 0)}>
        {bezig ? "Bezig…" : `Afrekenen ${euro(totaal)}`}
      </Knop>
    </section>
  );
}

function Rekening({ keuze, bestellingen, doe, klaar }: { keuze: Extract<Keuze, { soort: "tafel" | "bestelling" }>; bestellingen: SchermBestelling[]; doe: SchermDoe; klaar: (b: BonData[]) => void }) {
  const eigen = bestellingen.filter((b) => (keuze.soort === "tafel" ? b.tafelId === keuze.id : b.id === keuze.id));
  const rekening = rekeningVan(eigen);
  const [splits, setSplits] = useState<Splits>("alles");
  const [gekozen, setGekozen] = useState<Record<string, number>>({});
  const [personen, setPersonen] = useState(2);
  const [methoden, setMethoden] = useState<Methode[]>([]);
  const [bezig, setBezig] = useState(false);
  const selectie = splits === "gerecht" ? rekening.filter((r) => (gekozen[sleutel(r)] ?? 0) > 0).map((r) => ({ bestellingId: r.bestellingId, index: r.index, aantal: Math.min(r.aantal, gekozen[sleutel(r)] ?? 0) })) : null;
  const totaal = totaalVan(rekening);
  const te = selectie ? selectie.reduce((s, x) => s + (rekening.find((r) => sleutel(r) === sleutel(x))?.prijsCent ?? 0) * x.aantal, 0) : totaal;
  const delen = verdeelGelijk(totaal, personen);
  const nogOpen = eigen.some((b) => b.status === "NIEUW" || b.status === "IN_BEREIDING");
  const wie = keuze.soort === "tafel" ? { tafelId: keuze.id } : { bestellingId: keuze.id };

  async function betaal(body: Record<string, unknown>) {
    setBezig(true);
    const uit = await doe({ actie: "afrekenen", ...wie, ...body });
    setBezig(false);
    if (uit?.bonnen?.length) klaar(uit.bonnen);
  }

  if (!rekening.length) return <Leeg>Deze rekening is al betaald.</Leeg>;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <section aria-labelledby="rekening-kop" className="rounded-2xl bg-[#141A17] p-4 ring-1 ring-white/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rekening-kop" className="font-display text-3xl font-bold text-white">
            {keuze.naam}
          </h2>
          <p className="font-display text-3xl font-bold tabular-nums text-[#F5C451]">{euro(totaal)}</p>
        </div>
        {nogOpen && <p className="mt-1 text-sm font-semibold text-[#FCD34D]">Let op: er wordt nog iets bereid voor deze rekening.</p>}
        <div role="tablist" aria-label="Splitsen" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
          {(
            [
              ["alles", "Alles"],
              ["gerecht", "Per gerecht"],
              ["gelijk", "Gelijk verdelen"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={splits === id} onClick={() => setSplits(id)} className={`rounded-lg px-2 py-2 text-sm font-bold ${splits === id ? "bg-white text-[#0B0F0D]" : "text-[#B8C4BD]"}`}>
              {label}
            </button>
          ))}
        </div>
        <ul className="mt-3 divide-y divide-white/5">
          {rekening.map((r) => {
            const n = gekozen[sleutel(r)] ?? 0;
            return (
              <li key={sleutel(r)} className="flex items-center gap-3 py-2 text-lg text-white">
                <span className="w-10 flex-shrink-0 tabular-nums text-[#B8C4BD]">{r.aantal}×</span>
                <span className="min-w-0 flex-1 truncate">{r.naam}</span>
                {splits === "gerecht" && (
                  <span className="flex items-center gap-1" role="group" aria-label={`Hoeveel ${r.naam} nu afrekenen`}>
                    <button type="button" onClick={() => setGekozen((g) => ({ ...g, [sleutel(r)]: Math.max(0, n - 1) }))} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl font-bold" aria-label={`Eén ${r.naam} minder`}>
                      −
                    </button>
                    <span className="w-8 text-center font-bold tabular-nums">{n}</span>
                    <button type="button" onClick={() => setGekozen((g) => ({ ...g, [sleutel(r)]: Math.min(r.aantal, n + 1) }))} className="grid h-10 w-10 place-items-center rounded-full bg-[#22C55E] text-xl font-bold text-[#04130A]" aria-label={`Eén ${r.naam} erbij`}>
                      +
                    </button>
                  </span>
                )}
                <span className="w-24 flex-shrink-0 text-right tabular-nums">{euro(r.prijsCent * r.aantal)}</span>
              </li>
            );
          })}
        </ul>
        {splits === "gelijk" && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-[#B8C4BD]" id="aantal-personen">
                Aantal personen
              </span>
              <span className="flex items-center gap-2" role="group" aria-labelledby="aantal-personen">
                <button type="button" onClick={() => setPersonen((p) => Math.max(2, p - 1))} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl font-bold text-white" aria-label="Eén persoon minder">
                  −
                </button>
                <span className="w-8 text-center font-display text-2xl font-bold tabular-nums text-white" aria-live="polite">
                  {personen}
                </span>
                <button type="button" onClick={() => setPersonen((p) => Math.min(20, p + 1))} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl font-bold text-white" aria-label="Eén persoon meer">
                  +
                </button>
              </span>
            </div>
            <ul className="space-y-1">
              {delen.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-white">
                  <span>Persoon {i + 1}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold tabular-nums">{euro(d)}</span>
                    <label className="sr-only" htmlFor={`methode-${i}`}>
                      Betaalwijze persoon {i + 1}
                    </label>
                    <select id={`methode-${i}`} value={methoden[i] ?? "pin"} onChange={(e) => setMethoden((m) => Object.assign([...m], { [i]: e.target.value as Methode }))} className="rounded-lg border-0 bg-white/10 px-2 py-1.5 text-sm text-white">
                      <option value="pin">Pin</option>
                      <option value="contant">Contant</option>
                    </select>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {splits === "gelijk" ? (
        <section aria-label="Betalen" className="space-y-3 rounded-2xl bg-[#141A17] p-4 ring-1 ring-white/10">
          <p className="text-[#B8C4BD]">
            Reken {personen} keer af met de pinautomaat of contant. Als iedereen betaald heeft, tik je hieronder; elke persoon krijgt een eigen bon.
          </p>
          <Knop groot soort="doen" className="w-full text-xl" disabled={bezig} onClick={() => void betaal({ selectie: null, delen: delen.map((d, i) => ({ methode: methoden[i] ?? "pin", bedragCent: d, fooiCent: 0 })) })}>
            {bezig ? "Bezig…" : `Alle ${personen} delen betaald`}
          </Knop>
        </section>
      ) : (
        <Betalen key={`${keuze.id}-${splits}`} te={te} fooiAan doeBetaal={(methode, fooiCent) => void betaal({ selectie, delen: [{ methode, bedragCent: 0, fooiCent }] })} bezig={bezig} />
      )}
    </div>
  );
}

function SnelleVerkoop({ data, doe, klaar }: { data: SchermData; doe: SchermDoe; klaar: (b: BonData[]) => void }) {
  const items = useMemo(() => (data.items ?? []).filter((i) => i.beschikbaar), [data.items]);
  const cats = data.categorieen ?? [];
  const [cat, setCat] = useState("alles");
  const [mand, setMand] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<{ sleutel: string; itemId: string; aantal: number; opties: Gekozen[]; tekst: string; prijsCent: number }[]>([]);
  const [kiezen, setKiezen] = useState<(typeof items)[number] | null>(null);
  const [meegegeven, setMeegegeven] = useState(false);
  const [bezig, setBezig] = useState(false);
  const regels = Object.entries(mand).filter(([, n]) => n > 0);
  const te = regels.reduce((s, [id, n]) => s + (items.find((i) => i.id === id)?.prijsCent ?? 0) * n, 0) + extra.reduce((s, x) => s + x.prijsCent * x.aantal, 0);
  const aantalVan = (id: string) => (mand[id] ?? 0) + extra.filter((x) => x.itemId === id).reduce((s, x) => s + x.aantal, 0);
  const zichtbaar = items.filter((i) => cat === "alles" || i.categorieId === cat);

  async function betaal(methode: Methode, fooiCent: number) {
    setBezig(true);
    const uit = await doe({ actie: "verkoop", mand: [...regels.map(([itemId, aantal]) => ({ itemId, aantal })), ...extra.map((x) => ({ itemId: x.itemId, aantal: x.aantal, opties: x.opties }))], methode, fooiCent, meegegeven });
    setBezig(false);
    if (uit?.bonnen?.length) {
      setMand({});
      setExtra([]);
      klaar(uit.bonnen);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <section aria-labelledby="verkoop-kop" className="rounded-2xl bg-[#141A17] p-4 ring-1 ring-white/10">
        <h2 id="verkoop-kop" className="font-display text-2xl font-bold text-white">
          Snelle verkoop
        </h2>
        {cats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Categorie">
            {[{ id: "alles", naam: "Alles" }, ...cats].map((c) => (
              <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={`rounded-lg px-3 py-2 text-sm font-bold ${cat === c.id ? "bg-[#22C55E] text-[#04130A]" : "text-[#B8C4BD] ring-1 ring-white/15"}`}>
                {c.naam}
              </button>
            ))}
          </div>
        )}
        <ul className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {zichtbaar.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => (leesOpties(i.opties).length ? setKiezen(i) : setMand((m) => ({ ...m, [i.id]: Math.min(50, (m[i.id] ?? 0) + 1) })))} className="relative flex h-24 w-full flex-col justify-between rounded-xl bg-white/[0.06] p-3 text-left ring-1 ring-white/10 hover:bg-white/10 active:scale-[0.98]" aria-label={`${i.naam} erbij`}>
                <span className="line-clamp-2 text-base font-bold text-white">{i.naam}</span>
                <span className="text-sm text-[#B8C4BD]">{euro(i.prijsCent)}</span>
                {aantalVan(i.id) > 0 && <span className="absolute right-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-[#22C55E] px-1.5 text-sm font-bold text-[#04130A]">{aantalVan(i.id)}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="space-y-3">
        <section aria-label="Mandje" className="rounded-2xl bg-[#141A17] p-4 ring-1 ring-white/10">
          {regels.length === 0 && extra.length === 0 ? (
            <p className="text-[#9BA8A1]">Tik op wat er verkocht wordt.</p>
          ) : (
            <ul className="space-y-1">
              {regels.map(([id, n]) => {
                const i = items.find((x) => x.id === id);
                return (
                  <li key={id} className="flex items-center justify-between gap-2 text-white">
                    <span className="min-w-0 truncate">
                      {n}× {i?.naam}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{euro((i?.prijsCent ?? 0) * n)}</span>
                      <button type="button" onClick={() => setMand((m) => ({ ...m, [id]: Math.max(0, (m[id] ?? 0) - 1) }))} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 font-bold" aria-label={`Eén ${i?.naam ?? ""} minder`}>
                        −
                      </button>
                    </span>
                  </li>
                );
              })}
              {extra.map((x) => (
                <li key={x.sleutel} className="flex items-center justify-between gap-2 text-white">
                  <span className="min-w-0 truncate">
                    {x.aantal}× {items.find((i) => i.id === x.itemId)?.naam}
                    <span className="block truncate text-xs text-[#B8C4BD]">{x.tekst}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{euro(x.prijsCent * x.aantal)}</span>
                    <button type="button" onClick={() => setExtra((e) => (x.aantal > 1 ? e.map((y) => (y === x ? { ...y, aantal: y.aantal - 1 } : y)) : e.filter((y) => y !== x)))} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 font-bold" aria-label={`Eén ${items.find((i) => i.id === x.itemId)?.naam ?? ""} minder`}>
                      −
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <label className="mt-3 flex items-center gap-2 text-sm text-[#B8C4BD]">
            <input type="checkbox" className="h-5 w-5 accent-[#22C55E]" checked={meegegeven} onChange={(e) => setMeegegeven(e.target.checked)} />
            Al meegegeven (niet naar keuken of bar)
          </label>
        </section>
        <Betalen te={te} fooiAan doeBetaal={(m, f) => void betaal(m, f)} bezig={bezig} />
      </div>
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

export function KassaScherm({ data, doe }: SchermProps) {
  const [keuze, setKeuze] = useState<Keuze | null>(null);
  const [bonnen, setBonnen] = useState<BonData[] | null>(null);
  const klaar = (b: BonData[]) => {
    setBonnen(b);
    setKeuze(null);
  };
  return (
    <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[280px_1fr]">
      <Rekeningen data={data} keuze={keuze} kies={setKeuze} />
      <div className="min-w-0">
        {keuze === null ? (
          <Leeg>Kies links een rekening, of start een snelle verkoop.</Leeg>
        ) : keuze.soort === "verkoop" ? (
          <SnelleVerkoop data={data} doe={doe} klaar={klaar} />
        ) : (
          <Rekening key={`${keuze.soort}-${keuze.id}`} keuze={keuze} bestellingen={data.bestellingen ?? []} doe={doe} klaar={klaar} />
        )}
      </div>
      {bonnen && data.bonKop && <BonVenster kop={data.bonKop} bonnen={bonnen} sluit={() => setBonnen(null)} />}
    </div>
  );
}
