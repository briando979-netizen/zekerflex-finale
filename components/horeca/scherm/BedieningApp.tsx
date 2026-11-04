"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { faseVan } from "@/lib/horeca/fasen";
import { STAAT_LABEL, type TafelLive } from "@/lib/horeca/zaal";
import { euro } from "@/lib/horeca/weergave";
import type { Fase } from "@/lib/horeca/bestellen";
import { ZaalTegels } from "@/components/horeca/live/ZaalTegels";
import { OPROEP_LANG, RES_STATUS, tijdTot } from "@/components/horeca/live/teksten";
import { minTekst } from "@/components/horeca/live/stijl";
import type { BonData, SchermBestelling, SchermItem } from "@/components/horeca/live/types";
import { BonVenster } from "@/components/horeca/live/Bon";
import { ding, tril } from "@/components/horeca/scherm/apparaat";
import { Knop, Leeg, minSinds, useNieuw, type SchermDoe, type SchermProps } from "@/components/horeca/scherm/ui";

// ---------------------------------------------------------------------------
// De handheld van de bediening (telefoon, staand). Onderin vier tabbladen:
//   Tafels    — de zaal, wat aandacht vraagt bovenaan; tik een tafel voor acties
//   Klaar     — wat klaarstaat om weg te brengen, per tafel
//   Bestellen — opnemen in een paar tikken, met notitie per gerecht
//   Gasten    — de reserveringen van vandaag (als reserveren aan staat)
// Een oproep van een gast of iets nieuws om te serveren geeft geluid en een tril.
// ---------------------------------------------------------------------------

type Tab = "tafels" | "klaar" | "bestellen" | "gasten";
interface MandRegel {
  sleutel: string;
  itemId: string;
  aantal: number;
  opmerking: string;
}

const FASE_TEKEN: Record<Fase, { teken: string; kleur: string; label: string }> = {
  nieuw: { teken: "•", kleur: "text-[#FCD34D]", label: "nieuw" },
  gestart: { teken: "◐", kleur: "text-[#93C5FD]", label: "in de maak" },
  klaar: { teken: "✓", kleur: "text-[#86EFAC]", label: "klaar" },
  geserveerd: { teken: "✓✓", kleur: "text-[#6B7A72]", label: "geserveerd" },
};

function Regels({ b }: { b: SchermBestelling }) {
  return (
    <ul className="space-y-1">
      {b.regels.map((r, i) => {
        const f = FASE_TEKEN[faseVan(r)];
        return (
          <li key={i} className={`flex gap-2 text-base ${faseVan(r) === "geserveerd" ? "text-[#6B7A72]" : "text-white"}`}>
            <span className={`w-6 flex-shrink-0 text-center font-bold ${f.kleur}`} aria-hidden>
              {f.teken}
            </span>
            <span className="min-w-0">
              {r.aantal}× {r.naam}
              <span className="sr-only"> ({f.label})</span>
              {r.opmerking && <span className="block text-sm text-[#FDE68A]">{r.opmerking}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TafelBlad({ t, bestellingen, doe, sluit, bestel, kassa, naBon }: { t: TafelLive; bestellingen: SchermBestelling[]; doe: SchermDoe; sluit: () => void; bestel: () => void; kassa: boolean; naBon: (b: BonData[]) => void }) {
  const eerste = useRef<HTMLButtonElement>(null);
  const sluitRef = useRef(sluit);
  useEffect(() => {
    sluitRef.current = sluit;
  });
  // focus één keer bij openen (niet bij elke verversing), Escape sluit
  useEffect(() => {
    eerste.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") sluitRef.current();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  const eigen = bestellingen.filter((b) => b.tafelId === t.id && !b.betaald && b.status !== "GEANNULEERD");
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={sluit}>
      <div role="dialog" aria-modal="true" aria-labelledby="tafel-blad-kop" className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-[#141A17] p-5 ring-1 ring-white/10" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="tafel-blad-kop" className="font-display text-3xl font-bold text-white">
              {t.naam}
            </h2>
            <p className="text-[#B8C4BD]">
              {STAAT_LABEL[t.staat]}
              {t.sindsMin !== null && ` · ${minTekst(t.sindsMin)} aan tafel`}
            </p>
            {t.reservering && (
              <p className="mt-1 text-sm text-[#BFDBFE]">
                {t.reservering.tijd} · {t.reservering.naam} · {t.reservering.personen} pers.
              </p>
            )}
          </div>
          <button ref={eerste} type="button" onClick={sluit} className="rounded-full px-3 py-2 text-sm font-semibold text-[#B8C4BD] ring-1 ring-white/15">
            Sluiten
          </button>
        </div>
        {t.oproep && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#3A2203] p-3 text-[#FDE68A]">
            <span className="font-semibold">
              <span aria-hidden>🔔 </span>Gast {OPROEP_LANG[t.oproep]}
            </span>
            <Knop soort="let" onClick={() => void doe({ actie: "oproep-af", tafelId: t.id }, "Oproep afgehandeld.")}>
              Afgehandeld
            </Knop>
          </div>
        )}
        <div className="mt-4 space-y-3">
          {eigen.length === 0 ? (
            <p className="text-[#9BA8A1]">Nog niets besteld.</p>
          ) : (
            eigen.map((b) => (
              <div key={b.id} className="rounded-xl bg-white/[0.04] p-3">
                <p className="mb-1 flex justify-between text-sm text-[#9BA8A1]">
                  <span>
                    #{b.nummer} · {b.bron === "qr" ? "via QR" : "bediening"}
                  </span>
                  <span>{euro(b.totaalCent)}</span>
                </p>
                <Regels b={b} />
              </div>
            ))
          )}
        </div>
        {t.openCent > 0 && (
          <p className="mt-4 flex items-baseline justify-between text-lg">
            <span className="text-[#B8C4BD]">Open</span>
            <strong className="font-display text-2xl text-[#F5C451]">{euro(t.openCent)}</strong>
          </p>
        )}
        <div className="mt-5 grid gap-2">
          {t.serveren > 0 && (
            <Knop groot soort="doen" onClick={() => void doe({ actie: "serveer", tafelId: t.id }, `${t.naam}: geserveerd.`, () => void doe({ actie: "serveer", tafelId: t.id, terug: true }))}>
              Geserveerd ({t.serveren})
            </Knop>
          )}
          <Knop groot soort="rustig" onClick={bestel}>
            + Bestelling opnemen
          </Knop>
          {t.openCent > 0 && kassa && (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={`${t.naam} afrekenen (${euro(t.openCent)})`}>
              {(["pin", "contant"] as const).map((m) => (
                <Knop
                  key={m}
                  groot
                  soort="geld"
                  onClick={() => {
                    if (!window.confirm(`${t.naam}: ${euro(t.openCent)} afrekenen met ${m === "pin" ? "pin" : "contant"}?`)) return;
                    void doe({ actie: "afrekenen", tafelId: t.id, delen: [{ methode: m }] }).then((uit) => {
                      if (uit?.bonnen?.length) {
                        sluit();
                        naBon(uit.bonnen);
                      }
                    });
                  }}
                >
                  {m === "pin" ? "Pin" : "Contant"} {euro(t.openCent)}
                </Knop>
              ))}
            </div>
          )}
          {t.openCent > 0 && !kassa && (
            <Knop
              groot
              soort="geld"
              onClick={() => {
                if (window.confirm(`Is ${t.naam} afgerekend (${euro(t.openCent)})? De tafel wordt weer vrij.`)) void doe({ actie: "tafel-vrij", tafelId: t.id }, `${t.naam} afgerekend en vrij.`).then((ok) => ok && sluit());
              }}
            >
              Afgerekend, tafel vrij
            </Knop>
          )}
        </div>
      </div>
    </div>
  );
}

function Bestellen({ data, doe, tafelId, kiesTafel, klaar }: { data: SchermProps["data"]; doe: SchermDoe; tafelId: string | null; kiesTafel: (id: string | null) => void; klaar: () => void }) {
  const items = useMemo(() => data.items ?? [], [data.items]);
  const cats = data.categorieen ?? [];
  const tafels = data.tafels ?? [];
  const [cat, setCat] = useState<string>("alles");
  const [zoek, setZoek] = useState("");
  const [mand, setMand] = useState<MandRegel[]>([]);
  const [bekijk, setBekijk] = useState(false);
  const [opmerking, setOpmerking] = useState("");
  const [bezig, setBezig] = useState(false);
  const perId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const aantalVan = (id: string) => mand.filter((m) => m.itemId === id).reduce((s, m) => s + m.aantal, 0);
  const totaal = mand.reduce((s, m) => s + (perId.get(m.itemId)?.prijsCent ?? 0) * m.aantal, 0);
  const stuks = mand.reduce((s, m) => s + m.aantal, 0);

  const zichtbaar = items.filter((i) => (cat === "alles" || i.categorieId === cat) && (!zoek.trim() || i.naam.toLowerCase().includes(zoek.trim().toLowerCase())));

  function erbij(i: SchermItem, n: 1 | -1) {
    tril(10);
    setMand((m) => {
      const kaal = m.find((x) => x.itemId === i.id && !x.opmerking);
      if (n === 1) return kaal ? m.map((x) => (x === kaal ? { ...x, aantal: Math.min(50, x.aantal + 1) } : x)) : [...m, { sleutel: `${i.id}-${Date.now()}`, itemId: i.id, aantal: 1, opmerking: "" }];
      const laatste = kaal ?? [...m].reverse().find((x) => x.itemId === i.id);
      if (!laatste) return m;
      return laatste.aantal > 1 ? m.map((x) => (x === laatste ? { ...x, aantal: x.aantal - 1 } : x)) : m.filter((x) => x !== laatste);
    });
  }

  async function verstuur() {
    if (!mand.length) return;
    setBezig(true);
    const ok = await doe(
      { actie: "bestelling", tafelId, mand: mand.map((m) => ({ itemId: m.itemId, aantal: m.aantal, ...(m.opmerking.trim() ? { opmerking: m.opmerking.trim() } : {}) })), opmerking, naam: "" },
      "Verstuurd naar keuken en bar.",
    );
    setBezig(false);
    if (ok) {
      tril([30, 40, 30]);
      setMand([]);
      setOpmerking("");
      setBekijk(false);
      klaar();
    }
  }

  return (
    <div className="pb-28">
      <div className="sticky top-[57px] z-20 space-y-2 border-b border-white/10 bg-[#0B0F0D]/95 px-3 py-2 backdrop-blur">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="group" aria-label="Tafel">
          <button type="button" aria-pressed={tafelId === null} onClick={() => kiesTafel(null)} className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-bold ${tafelId === null ? "bg-white text-[#0B0F0D]" : "bg-white/10 text-white"}`}>
            Zonder tafel
          </button>
          {tafels.map((t) => (
            <button key={t.id} type="button" aria-pressed={tafelId === t.id} onClick={() => kiesTafel(t.id)} className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-bold ${tafelId === t.id ? "bg-white text-[#0B0F0D]" : "bg-white/10 text-white"}`}>
              {t.naam}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label htmlFor="zoek-gerecht" className="sr-only">
            Zoek een gerecht
          </label>
          <input id="zoek-gerecht" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een gerecht" className="min-w-0 flex-1 rounded-xl border-0 bg-white/10 px-3 py-2 text-white placeholder:text-[#9BA8A1] focus:outline-none focus:ring-2 focus:ring-[#22C55E]" />
        </div>
        {cats.length > 0 && (
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3" role="group" aria-label="Categorie">
            {[{ id: "alles", naam: "Alles" }, ...cats].map((c) => (
              <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold ${cat === c.id ? "bg-[#22C55E] text-[#04130A]" : "text-[#B8C4BD] ring-1 ring-white/15"}`}>
                {c.naam}
              </button>
            ))}
          </div>
        )}
      </div>

      {bekijk ? (
        <section className="space-y-3 p-3" aria-labelledby="mand-kop">
          <h2 id="mand-kop" className="font-display text-xl font-bold text-white">
            Bestelling voor {tafelId ? (tafels.find((t) => t.id === tafelId)?.naam ?? "tafel") : "zonder tafel"}
          </h2>
          {mand.length === 0 && <Leeg>Nog niets gekozen.</Leeg>}
          <ul className="space-y-2">
            {mand.map((m) => {
              const i = perId.get(m.itemId);
              return (
                <li key={m.sleutel} className="rounded-xl bg-white/[0.05] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-base font-semibold text-white">
                      {m.aantal}× {i?.naam ?? "Gerecht"}
                    </span>
                    <span className="text-[#B8C4BD]">{euro((i?.prijsCent ?? 0) * m.aantal)}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <label htmlFor={`notitie-${m.sleutel}`} className="sr-only">
                      Notitie bij {i?.naam}
                    </label>
                    <input
                      id={`notitie-${m.sleutel}`}
                      value={m.opmerking}
                      onChange={(e) => setMand((x) => x.map((y) => (y.sleutel === m.sleutel ? { ...y, opmerking: e.target.value.slice(0, 140) } : y)))}
                      placeholder="Notitie, bijv. zonder ui"
                      className="min-w-0 flex-1 rounded-lg border-0 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-[#9BA8A1] focus:outline-none focus:ring-2 focus:ring-[#22C55E]"
                    />
                    <Knop soort="stil" onClick={() => setMand((x) => x.filter((y) => y.sleutel !== m.sleutel))}>
                      Weg<span className="sr-only"> ({i?.naam})</span>
                    </Knop>
                  </div>
                </li>
              );
            })}
          </ul>
          <label htmlFor="bestel-opmerking" className="block text-sm font-semibold text-[#B8C4BD]">
            Opmerking voor keuken en bar
          </label>
          <input id="bestel-opmerking" value={opmerking} onChange={(e) => setOpmerking(e.target.value.slice(0, 300))} placeholder="Bijv. allergie noten, eerst de drankjes" className="w-full rounded-xl border-0 bg-white/10 px-3 py-3 text-white placeholder:text-[#9BA8A1] focus:outline-none focus:ring-2 focus:ring-[#22C55E]" />
          <Knop soort="stil" onClick={() => setBekijk(false)}>
            Verder kiezen
          </Knop>
        </section>
      ) : (
        <ul className="divide-y divide-white/5 px-3">
          {zichtbaar.length === 0 && <li className="py-6 text-center text-[#9BA8A1]">Geen gerechten gevonden.</li>}
          {zichtbaar.map((i) => {
            const n = aantalVan(i.id);
            return (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-base font-semibold ${i.beschikbaar ? "text-white" : "text-[#6B7A72] line-through"}`}>{i.naam}</span>
                  <span className="text-sm text-[#9BA8A1]">
                    {euro(i.prijsCent)} · {i.station === "bar" ? "bar" : "keuken"}
                    {!i.beschikbaar && " · uitverkocht"}
                  </span>
                </span>
                {n > 0 && (
                  <button type="button" onClick={() => erbij(i, -1)} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl font-bold text-white" aria-label={`Eén ${i.naam} minder`}>
                    −
                  </button>
                )}
                {n > 0 && (
                  <span className="w-6 text-center font-display text-xl font-bold tabular-nums text-white" aria-live="polite">
                    {n}
                  </span>
                )}
                <button type="button" disabled={!i.beschikbaar} onClick={() => erbij(i, 1)} className="grid h-11 w-11 place-items-center rounded-full bg-[#22C55E] text-2xl font-bold text-[#04130A] disabled:bg-white/5 disabled:text-[#6B7A72]" aria-label={`${i.naam} erbij`}>
                  +
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {stuks > 0 && (
        <div className="fixed inset-x-0 bottom-[72px] z-30 px-3" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          {bekijk ? (
            <Knop groot soort="doen" className="w-full shadow-2xl" disabled={bezig} onClick={() => void verstuur()}>
              {bezig ? "Versturen…" : `Verstuur · ${stuks} · ${euro(totaal)}`}
            </Knop>
          ) : (
            <Knop groot soort="doen" className="w-full shadow-2xl" onClick={() => setBekijk(true)}>
              Bekijk bestelling · {stuks} · {euro(totaal)}
            </Knop>
          )}
        </div>
      )}
    </div>
  );
}

export function BedieningApp({ data, doe, nu, geluid }: SchermProps) {
  const [tab, setTab] = useState<Tab>("tafels");
  const [open, setOpen] = useState<string | null>(null);
  const [bestelTafel, setBestelTafel] = useState<string | null>(null);
  const [bonnen, setBonnen] = useState<BonData[] | null>(null);
  const kassa = (data.zaak.modules ?? []).includes("kassa");
  const zaal = data.zaal ?? [];
  const bestellingen = data.bestellingen ?? [];
  const oproepen = data.oproepen ?? [];
  const reserveringen = (data.reserveringen ?? []).filter((r) => r.status !== "GEANNULEERD");
  const heeftGasten = (data.zaak.modules ?? []).includes("reserveren");
  const klaar = bestellingen.filter((b) => b.status !== "GEANNULEERD" && b.regels.some((r) => faseVan(r) === "klaar"));
  const klaarStuks = klaar.reduce((s, b) => s + b.regels.filter((r) => faseVan(r) === "klaar").reduce((x, r) => x + r.aantal, 0), 0);
  const tafel = zaal.find((t) => t.id === open) ?? null;

  // seintje bij een nieuwe oproep of iets nieuws om weg te brengen
  useNieuw([...oproepen.map((o) => `o:${o.tafelId}:${o.soort}:${o.op}`), ...klaar.map((b) => `k:${b.id}:${b.regels.filter((r) => faseVan(r) === "klaar").length}`)], () => {
    if (geluid) ding(true);
    tril([80, 60, 80]);
  });

  const tabs: { id: Tab; label: string; teller: number; kleur: string }[] = [
    { id: "tafels", label: "Tafels", teller: oproepen.length, kleur: "bg-[#F59E0B] text-[#1C1003]" },
    { id: "klaar", label: "Klaar", teller: klaarStuks, kleur: "bg-[#22C55E] text-[#04130A]" },
    { id: "bestellen", label: "Bestellen", teller: 0, kleur: "" },
    ...(heeftGasten ? [{ id: "gasten" as const, label: "Gasten", teller: reserveringen.filter((r) => r.status === "BEVESTIGD").length, kleur: "bg-[#3B82F6] text-white" }] : []),
  ];

  return (
    <div className="pb-24">
      {tab === "tafels" && (
        <div className="space-y-3 p-3">
          {oproepen.length > 0 && (
            <ul className="space-y-2" aria-label="Oproepen">
              {oproepen.map((o) => (
                <li key={`${o.tafelId}-${o.soort}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#3A2203] p-3 ring-2 ring-[#F59E0B]">
                  <span className="text-[#FDE68A]">
                    <span aria-hidden>🔔 </span>
                    <strong className="text-white">{o.tafelNaam || "Tafel"}</strong> {OPROEP_LANG[o.soort]} · {minTekst(minSinds(o.op, nu))}
                  </span>
                  <Knop soort="let" onClick={() => void doe({ actie: "oproep-af", tafelId: o.tafelId, soort: o.soort }, "Afgehandeld.")}>
                    Ik ga<span className="sr-only"> naar {o.tafelNaam}</span>
                  </Knop>
                </li>
              ))}
            </ul>
          )}
          <ZaalTegels zaal={zaal} donker onKies={(t) => setOpen(t.id)} label="Tafels" />
        </div>
      )}

      {tab === "klaar" && (
        <div className="space-y-3 p-3">
          {klaar.length === 0 ? (
            <Leeg>Niets klaar om weg te brengen.</Leeg>
          ) : (
            klaar.map((b) => (
              <section key={b.id} className="rounded-2xl bg-[#141A17] p-4 ring-2 ring-[#22C55E]" aria-label={`${b.tafelNaam ?? "Balie"}, bestelling ${b.nummer}`}>
                <p className="flex items-baseline justify-between">
                  <span className="font-display text-2xl font-bold text-white">{b.tafelNaam ?? "Balie"}</span>
                  <span className="text-sm text-[#9BA8A1]">#{b.nummer}</span>
                </p>
                <ul className="mt-2 space-y-1">
                  {b.regels
                    .filter((r) => faseVan(r) === "klaar")
                    .map((r, i) => (
                      <li key={i} className="text-lg text-white">
                        {r.aantal}× {r.naam}
                        {r.opmerking && <span className="block text-sm text-[#FDE68A]">{r.opmerking}</span>}
                      </li>
                    ))}
                </ul>
                <Knop groot soort="doen" className="mt-3 w-full" onClick={() => void doe({ actie: "serveer", id: b.id }, "Geserveerd.", () => void doe({ actie: "serveer", id: b.id, terug: true }))}>
                  Geserveerd
                </Knop>
              </section>
            ))
          )}
        </div>
      )}

      {tab === "bestellen" && (
        <Bestellen
          data={data}
          doe={doe}
          tafelId={bestelTafel}
          kiesTafel={setBestelTafel}
          klaar={() => {
            setTab("tafels");
          }}
        />
      )}

      {tab === "gasten" && heeftGasten && (
        <div className="space-y-2 p-3">
          {reserveringen.length === 0 ? (
            <Leeg>Geen reserveringen vandaag.</Leeg>
          ) : (
            reserveringen.map((r) => (
              <div key={r.id} className={`rounded-xl p-3 ${r.status === "BEVESTIGD" ? "bg-[#13254A]" : "bg-white/[0.04]"}`}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold text-white">
                    {r.tijd} · {r.naam}
                  </span>
                  <span className="text-sm text-[#B8C4BD]">{r.personen} p.</span>
                </p>
                <p className="text-sm text-[#B8C4BD]">
                  {RES_STATUS[r.status]}
                  {r.status === "BEVESTIGD" && data.nu ? ` · ${tijdTot(r.tijd, data.nu.minuten)}` : ""}
                  {r.tafelNaam ? ` · ${r.tafelNaam}` : ""}
                </p>
                {r.opmerking && <p className="mt-1 text-sm text-[#FDE68A]">{r.opmerking}</p>}
                {r.status === "BEVESTIGD" && (
                  <div className="mt-2 flex gap-2">
                    <Knop soort="doen" onClick={() => void doe({ actie: "reservering-status", id: r.id, status: "AANGEKOMEN" }, `${r.naam} is binnen.`, () => void doe({ actie: "reservering-status", id: r.id, status: "BEVESTIGD" }))}>
                      Binnen<span className="sr-only"> ({r.naam})</span>
                    </Knop>
                    <Knop soort="stil" onClick={() => void doe({ actie: "reservering-status", id: r.id, status: "NIET_GEKOMEN" }, `${r.naam}: niet gekomen.`, () => void doe({ actie: "reservering-status", id: r.id, status: "BEVESTIGD" }))}>
                      Niet gekomen<span className="sr-only"> ({r.naam})</span>
                    </Knop>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tafel && (
        <TafelBlad
          t={tafel}
          bestellingen={bestellingen}
          doe={doe}
          sluit={() => setOpen(null)}
          kassa={kassa}
          naBon={setBonnen}
          bestel={() => {
            setBestelTafel(tafel.id);
            setOpen(null);
            setTab("bestellen");
          }}
        />
      )}

      {bonnen && data.bonKop && <BonVenster kop={data.bonKop} bonnen={bonnen} sluit={() => setBonnen(null)} />}

      <nav aria-label="Bediening" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-white/10 bg-[#0B0F0D]/95 backdrop-blur" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)} className={`relative flex h-[72px] flex-col items-center justify-center gap-1 text-sm font-bold ${tab === t.id ? "text-white" : "text-[#9BA8A1]"}`}>
            <span className={`h-1 w-8 rounded-full ${tab === t.id ? "bg-[#22C55E]" : "bg-transparent"}`} aria-hidden />
            {t.label}
            {t.teller > 0 && (
              <span className={`absolute right-[18%] top-2 min-w-6 rounded-full px-1.5 text-center text-xs font-bold ${t.kleur}`}>
                {t.teller}
                <span className="sr-only"> nieuw</span>
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
