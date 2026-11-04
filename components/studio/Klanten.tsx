"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { foutVan } from "@/components/studio/context";
import { Card, Empty, ISearch, IUsers, PageHead, Pill, Stat, btn, input } from "@/components/studio/ui";
import { klantCijfers, klantenCsv, type Klant } from "@/lib/sites/klanten";
import { euro } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Websitestudio → Klanten: iedereen die via de eigen website bestelde of een
// tafel reserveerde, samengevoegd per e-mailadres (lib/sites/klanten.ts). Te
// zoeken en te sorteren, met mailen en bellen met één klik en alles als CSV.
// Data: GET /api/werkgever/sites/klanten.
// ---------------------------------------------------------------------------

const API = "/api/werkgever/sites/klanten";

type Sort = "laatst" | "besteed" | "bestellingen" | "naam";
const SORT: { id: Sort; label: string }[] = [
  { id: "laatst", label: "Laatst actief" },
  { id: "besteed", label: "Meest besteed" },
  { id: "bestellingen", label: "Meeste bestellingen" },
  { id: "naam", label: "Naam" },
];

const dag = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });

export default function Klanten() {
  const [klanten, setKlanten] = useState<Klant[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");
  const [sort, setSort] = useState<Sort>("laatst");

  const laad = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setFout(await foutVan(res, "De klanten konden niet laden. Probeer het opnieuw."));
    setFout(null);
    setKlanten(((await res.json()) as { klanten: Klant[] }).klanten);
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    const lijst = (klanten ?? []).filter((k) => !q || [k.naam, k.email, k.telefoon, k.plaats].some((v) => v.toLowerCase().includes(q)));
    const op: Record<Sort, (a: Klant, b: Klant) => number> = {
      laatst: (a, b) => b.laatste.localeCompare(a.laatste),
      besteed: (a, b) => b.besteedCents - a.besteedCents,
      bestellingen: (a, b) => b.bestellingen - a.bestellingen || b.reserveringen - a.reserveringen,
      naam: (a, b) => a.naam.localeCompare(b.naam, "nl"),
    };
    return [...lijst].sort(op[sort]);
  }, [klanten, zoek, sort]);

  const cijfers = useMemo(() => klantCijfers(klanten ?? []), [klanten]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([klantenCsv(zichtbaar)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "klanten.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        title="Klanten"
        sub="Iedereen die via je website bestelde of een tafel reserveerde. Je hoeft niets bij te houden: de lijst vult zich vanzelf."
        actions={<button type="button" className={btn.secondary} onClick={download} disabled={!zichtbaar.length}>Exporteer CSV</button>}
      />
      {fout && (
        <Card className="mb-4">
          <p role="alert" className="text-sm text-[#b42318]">{fout}</p>
          <button type="button" className={`${btn.secondary} mt-3`} onClick={() => void laad()}>Opnieuw laden</button>
        </Card>
      )}
      {!klanten && !fout ? (
        <Card><p className="text-sm text-[#616161]">Laden…</p></Card>
      ) : klanten && klanten.length === 0 ? (
        <Card>
          <Empty icon={<IUsers />} title="Nog geen klanten" text="Zodra iemand via je website bestelt of een tafel reserveert, staat die hier, met alles wat hij eerder deed." />
        </Card>
      ) : klanten ? (
        <>
          <Card className="mb-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Klanten" value={cijfers.aantal} />
              <Stat label="Kwamen terug" value={cijfers.terugkerend} hint="twee keer of vaker besteld of gereserveerd" />
              <Stat label="Gemiddeld besteed" value={euro(cijfers.gemiddeldCents)} hint="per klant die bestelde" />
            </div>
          </Card>
          <Card pad={false}>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#ebebeb] p-4">
              <label className="relative min-w-[200px] flex-1">
                <span className="sr-only">Zoek een klant</span>
                <ISearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#707070]" />
                <input className={`${input} pl-9`} value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, e-mail, telefoon of plaats" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-[#303030]">
                Sorteer
                <select className={`${input} w-auto`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  {SORT.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {zichtbaar.length === 0 ? (
              <p className="p-5 text-sm text-[#616161]">Geen klant gevonden met “{zoek}”.</p>
            ) : (
              <ul className="divide-y divide-[#ebebeb]">
                {zichtbaar.map((k) => (
                  <li key={k.sleutel} className="grid gap-2 px-5 py-3.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#1a1a1a]">
                        {k.naam || "Zonder naam"} {k.bestellingen + k.reserveringen >= 2 && <Pill tone="ok">Vaste klant</Pill>}
                      </p>
                      <p className="truncate text-sm text-[#616161]">
                        {k.email && <a className="underline-offset-2 hover:underline" href={`mailto:${k.email}`}>{k.email}</a>}
                        {k.email && k.telefoon && " · "}
                        {k.telefoon && <a className="underline-offset-2 hover:underline" href={`tel:${k.telefoon.replace(/[^\d+]/g, "")}`}>{k.telefoon}</a>}
                        {k.plaats && ` · ${k.plaats}`}
                      </p>
                    </div>
                    <p className="text-sm text-[#303030]">
                      {k.bestellingen > 0 && <span>{k.bestellingen === 1 ? "1 bestelling" : `${k.bestellingen} bestellingen`} · <strong>{euro(k.besteedCents)}</strong></span>}
                      {k.bestellingen > 0 && k.reserveringen > 0 && <br />}
                      {k.reserveringen > 0 && <span>{k.reserveringen === 1 ? "1 reservering" : `${k.reserveringen} reserveringen`}</span>}
                    </p>
                    <p className="text-sm text-[#707070] md:text-right">Laatst {dag.format(new Date(k.laatste))}<br />Klant sinds {dag.format(new Date(k.eerste))}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
