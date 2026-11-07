"use client";

import { useEffect, useMemo, useState } from "react";
import { ALLERGENEN, type Allergeen } from "@/lib/horeca/allergenen";
import { MAX_AANTAL, STATUS_LABEL, type BestelStatus } from "@/lib/horeca/bestellen";
import type { Gekozen, OptieGroep } from "@/lib/horeca/opties";
import { KeuzeVenster } from "@/components/horeca/live/KeuzeVenster";
import { AfrekenBlok, type Terug } from "@/components/horeca/site/AfrekenBlok";

// Bestellen aan tafel via de QR-code: de menukaart met "+"-knoppen, een vast
// mandje onderin, en na het bestellen het volgnummer met de status die vanzelf
// ververst. Prijzen in het mandje zijn een indicatie; de server rekent zelf.

export interface MenuGroep {
  id: string;
  naam: string;
  items: { id: string; naam: string; omschrijving: string; prijsCent: number; allergenen: string[]; vegetarisch: boolean; veganistisch: boolean; beschikbaar: boolean; opties: OptieGroep[]; voorraad: number | null }[];
}

/** Een gerecht met gekozen opties (bakwijze, saus): eigen regel met eigen prijs. */
interface OptieRegel {
  sleutel: string;
  itemId: string;
  aantal: number;
  opties: Gekozen[];
  tekst: string;
  prijsCent: number;
}

const euro = (cent: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);

// De ober roepen of de rekening vragen: de bediening ziet het meteen op de handheld.
function RoepKnoppen({ slug, code }: { slug: string; code: string }) {
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);
  const [bezig, setBezig] = useState(false);
  async function roep(soort: "ober" | "rekening") {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch(`/api/horeca/site/${slug}/oproep`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, soort }) });
      const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Dat lukte niet. Steek gerust je hand op.");
      setMelding({ tekst: soort === "ober" ? "De bediening weet het en komt naar je toe." : "De bediening komt met de rekening.", fout: false });
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Dat lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }
  return (
    <div className="rounded-[1.75rem] bg-white p-4 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={bezig} onClick={() => void roep("ober")} className="flex-1 rounded-full px-4 py-3 text-sm font-bold ring-1 ring-[#0A120E]/20 disabled:opacity-60">
          Ober roepen
        </button>
        <button type="button" disabled={bezig} onClick={() => void roep("rekening")} className="flex-1 rounded-full px-4 py-3 text-sm font-bold ring-1 ring-[#0A120E]/20 disabled:opacity-60">
          Rekening vragen
        </button>
      </div>
      {melding && (
        <p role={melding.fout ? "alert" : "status"} className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${melding.fout ? "bg-[#FDE2E2] text-[#B91C1C]" : "bg-[#E7F5EC] text-[#14532D]"}`}>
          {melding.tekst}
        </p>
      )}
    </div>
  );
}

export function BestelMenu({ slug, code, tafel, groepen, afrekenen = false, terug = null }: { slug: string; code: string; tafel: string; groepen: MenuGroep[]; afrekenen?: boolean; terug?: Terug }) {
  const [mand, setMand] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<OptieRegel[]>([]);
  const [kiezen, setKiezen] = useState<MenuGroep["items"][number] | null>(null);
  const [opmerking, setOpmerking] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [geplaatst, setGeplaatst] = useState<{ id: string; nummer: number; status: BestelStatus } | null>(null);
  const [open, setOpen] = useState(false);

  const items = useMemo(() => new Map(groepen.flatMap((g) => g.items.map((i) => [i.id, i] as const))), [groepen]);
  const regels = Object.entries(mand).filter(([, n]) => n > 0);
  const aantal = regels.reduce((s, [, n]) => s + n, 0) + extra.reduce((s, x) => s + x.aantal, 0);
  const totaal = regels.reduce((s, [id, n]) => s + (items.get(id)?.prijsCent ?? 0) * n, 0) + extra.reduce((s, x) => s + x.prijsCent * x.aantal, 0);
  const zet = (id: string, n: number) => setMand((m) => ({ ...m, [id]: Math.max(0, Math.min(MAX_AANTAL, n)) }));
  const aantalVan = (id: string) => (mand[id] ?? 0) + extra.filter((x) => x.itemId === id).reduce((s, x) => s + x.aantal, 0);
  const minder = (id: string) => {
    const laatste = [...extra].reverse().find((x) => x.itemId === id);
    if (!laatste) return zet(id, (mand[id] ?? 0) - 1);
    setExtra((e) => (laatste.aantal > 1 ? e.map((x) => (x === laatste ? { ...x, aantal: x.aantal - 1 } : x)) : e.filter((x) => x !== laatste)));
  };
  const plus = (i: MenuGroep["items"][number]) => {
    if (i.opties.length) setKiezen(i);
    else zet(i.id, (mand[i.id] ?? 0) + 1);
  };

  // status volgen na het bestellen
  useEffect(() => {
    if (!geplaatst || geplaatst.status === "GESERVEERD" || geplaatst.status === "GEANNULEERD") return;
    const t = window.setInterval(async () => {
      const r = await fetch(`/api/horeca/site/${slug}/bestelling?code=${encodeURIComponent(code)}&id=${encodeURIComponent(geplaatst.id)}`, { cache: "no-store" }).catch(() => null);
      const d = r?.ok ? ((await r.json()) as { status: BestelStatus }) : null;
      if (d && d.status !== geplaatst.status) setGeplaatst((g) => (g ? { ...g, status: d.status } : g));
    }, 8000);
    return () => window.clearInterval(t);
  }, [geplaatst, slug, code]);

  async function bestel() {
    setBezig(true);
    setFout("");
    try {
      const r = await fetch(`/api/horeca/site/${slug}/bestellen`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, mand: [...regels.map(([itemId, n]) => ({ itemId, aantal: n })), ...extra.map((x) => ({ itemId: x.itemId, aantal: x.aantal, opties: x.opties }))], opmerking }),
      });
      const d = (await r.json().catch(() => ({}))) as { id?: string; nummer?: number; error?: { message?: string } };
      if (!r.ok || !d.id || !d.nummer) throw new Error(d.error?.message ?? "Bestellen lukte niet. Probeer het opnieuw of vraag de bediening.");
      setGeplaatst({ id: d.id, nummer: d.nummer, status: "NIEUW" });
      setMand({});
      setExtra([]);
      setOpmerking("");
      setOpen(false);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Bestellen lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="pb-40">
      {geplaatst && (
        <div role="status" className="mx-auto mt-6 max-w-3xl rounded-[1.75rem] bg-[var(--rs-nacht)] p-6 text-[var(--rs-creme)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">Doorgegeven</p>
          <p className="mt-2 font-display text-3xl font-bold">Bestelling {geplaatst.nummer}</p>
          <p className="mt-2">
            Status: <strong>{STATUS_LABEL[geplaatst.status]}</strong>. Dit scherm ververst vanzelf.
          </p>
          <button type="button" onClick={() => setGeplaatst(null)} className="mt-4 rounded-full px-5 py-2 font-semibold ring-1 ring-white/30">
            Nog iets bestellen
          </button>
        </div>
      )}
      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6">
        <p className="text-sm text-[#4B5563]">
          Je bestelt voor <strong className="text-[#0A120E]">{tafel}</strong>. {afrekenen ? "Afrekenen kan hier met iDEAL of gewoon bij de bediening." : "Je rekent af zoals je gewend bent."}
        </p>
        {afrekenen && <AfrekenBlok slug={slug} code={code} terug={terug} />}
        <RoepKnoppen slug={slug} code={code} />
        {groepen.map((g) => (
          <section key={g.id} aria-labelledby={`g-${g.id}`} className="rounded-[1.75rem] bg-white p-5 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
            <h2 id={`g-${g.id}`} className="font-display text-2xl font-bold">
              {g.naam}
            </h2>
            <ul className="mt-2 divide-y divide-[#0A120E]/10">
              {g.items.map((i) => {
                const n = aantalVan(i.id);
                return (
                  <li key={i.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {i.naam} <span className="font-normal text-[#4B5563]">· {euro(i.prijsCent)}</span>
                      </p>
                      {i.omschrijving && <p className="text-sm text-[#4B5563]">{i.omschrijving}</p>}
                      {i.opties.length > 0 && <p className="text-xs font-semibold text-[#4B5563]">Met keuze: {i.opties.map((g) => g.naam.toLowerCase()).join(", ")}</p>}
                      {i.beschikbaar && typeof i.voorraad === "number" && i.voorraad <= 5 && <p className="text-xs font-bold text-[#B45309]">Nog {i.voorraad}</p>}
                      <p className="text-xs text-[#4B5563]">
                        {i.veganistisch ? "Veganistisch" : i.vegetarisch ? "Vegetarisch" : ""}
                        {(i.veganistisch || i.vegetarisch) && i.allergenen.length > 0 && " · "}
                        {i.allergenen.length > 0 && `Bevat: ${i.allergenen.map((a) => ALLERGENEN[a as Allergeen]?.toLowerCase() ?? a).join(", ")}`}
                      </p>
                    </div>
                    {i.beschikbaar ? (
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {n > 0 && (
                          <>
                            <button type="button" onClick={() => minder(i.id)} aria-label={`Eén ${i.naam} minder`} className="grid h-10 w-10 place-items-center rounded-full text-xl font-bold ring-1 ring-[#0A120E]/20">
                              −
                            </button>
                            <span className="w-6 text-center font-bold" aria-live="polite">
                              {n}
                            </span>
                          </>
                        )}
                        <button type="button" onClick={() => plus(i)} aria-label={`${i.naam} toevoegen`} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--rs-kleur-knop)] text-xl font-bold text-[var(--rs-op-kleur)]">
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="flex-shrink-0 rounded-full bg-[#F4E9DA] px-3 py-1 text-xs font-bold text-[#4B5563]">uitverkocht</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {kiezen && (
        <KeuzeVenster
          naam={kiezen.naam}
          prijsCent={kiezen.prijsCent}
          groepen={kiezen.opties}
          sluit={() => setKiezen(null)}
          kies={(g) => {
            const item = kiezen;
            setKiezen(null);
            setExtra((e) => {
              const zelfde = e.find((x) => x.itemId === item.id && x.tekst === g.tekst);
              if (zelfde) return e.map((x) => (x === zelfde ? { ...x, aantal: Math.min(MAX_AANTAL, x.aantal + 1) } : x));
              return [...e, { sleutel: `${item.id}-${e.length}-${g.tekst}`, itemId: item.id, aantal: 1, opties: g.opties, tekst: g.tekst, prijsCent: g.prijsCent }];
            });
          }}
        />
      )}

      {aantal > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0A120E]/10 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(10,18,14,0.08)] backdrop-blur">
          <div className="mx-auto max-w-3xl">
            {open && (
              <div className="mb-3 max-h-[45vh] space-y-2 overflow-y-auto">
                <ul className="text-sm">
                  {regels.map(([id, n]) => (
                    <li key={id} className="flex justify-between gap-3 py-1">
                      <span>
                        {n}× {items.get(id)?.naam}
                      </span>
                      <span>{euro((items.get(id)?.prijsCent ?? 0) * n)}</span>
                    </li>
                  ))}
                  {extra.map((x) => (
                    <li key={x.sleutel} className="flex justify-between gap-3 py-1">
                      <span>
                        {x.aantal}× {items.get(x.itemId)?.naam}
                        <span className="block text-xs text-[#4B5563]">{x.tekst}</span>
                      </span>
                      <span>{euro(x.prijsCent * x.aantal)}</span>
                    </li>
                  ))}
                </ul>
                <label className="block text-sm font-semibold">
                  Opmerking voor de keuken (mag leeg)
                  <input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} maxLength={300} className="mt-1 w-full rounded-xl border-0 px-3 py-2 ring-1 ring-[#0A120E]/20" placeholder="Bijvoorbeeld: zonder ui" />
                </label>
              </div>
            )}
            {fout && (
              <p role="alert" className="mb-2 rounded-xl bg-[#FDE2E2] px-3 py-2 text-sm font-semibold text-[#B91C1C]">
                {fout}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-full px-4 py-3 text-sm font-semibold ring-1 ring-[#0A120E]/20">
                {open ? "Verberg" : "Bekijk"} mandje ({aantal})
              </button>
              <button type="button" onClick={() => (open ? void bestel() : setOpen(true))} disabled={bezig} className="flex-1 rounded-full bg-[var(--rs-accent-knop)] px-5 py-3 font-bold text-[var(--rs-op-accent)] disabled:opacity-60">
                {bezig ? "Bezig…" : open ? `Bestel voor ${euro(totaal)}` : `Verder · ${euro(totaal)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
