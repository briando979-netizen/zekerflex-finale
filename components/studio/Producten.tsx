"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { foutVan, useStudio } from "@/components/studio/context";
import { Card, Empty, IImage, IPlus, ISearch, IStore, ITag, IX, PageHead, Pill, btn, input } from "@/components/studio/ui";
import { categorieen, euro, isUitverkocht, productSlug } from "@/lib/sites/winkel";
import type { Media, SiteProduct } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Websitestudio → Producten: alle producten van de webshop in één tabel, met
// zoeken, filters en de volgorde zoals bezoekers ze zien. Een klik opent het
// product (components/studio/ProductEditor.tsx). Ook: producten overnemen uit
// de ZekerFlex-webshop, met foto. Wijzigingen staan meteen live.
// ---------------------------------------------------------------------------

type Filter = "alle" | "actief" | "verborgen" | "uitverkocht";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "alle", label: "Alle" },
  { id: "actief", label: "Online" },
  { id: "verborgen", label: "Verborgen" },
  { id: "uitverkocht", label: "Uitverkocht" },
];

export default function Producten() {
  const { data, winkel, saveWinkel } = useStudio();
  const site = data!.site!;
  const router = useRouter();
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const [cat, setCat] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [importeren, setImporteren] = useState(false);

  const media = useMemo(() => new Map(site.media.map((m) => [m.id, m])), [site.media]);
  const cats = categorieen(winkel.producten);
  const lijst = winkel.producten.filter((p) => {
    if (filter === "actief" && !p.zichtbaar) return false;
    if (filter === "verborgen" && p.zichtbaar) return false;
    if (filter === "uitverkocht" && !isUitverkocht(p)) return false;
    if (cat && p.categorie !== cat) return false;
    const q = zoek.trim().toLowerCase();
    return !q || p.naam.toLowerCase().includes(q) || p.categorie.toLowerCase().includes(q);
  });
  const sorteerbaar = filter === "alle" && !cat && !zoek.trim();

  const verplaats = async (id: string, d: -1 | 1) => {
    const lijst2 = [...winkel.producten];
    const i = lijst2.findIndex((p) => p.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= lijst2.length) return;
    [lijst2[i], lijst2[j]] = [lijst2[j]!, lijst2[i]!];
    setFout(await saveWinkel({ ...winkel, producten: lijst2 }));
  };

  return (
    <>
      <PageHead
        title="Producten"
        sub={`${winkel.producten.length} product${winkel.producten.length === 1 ? "" : "en"} · wijzigingen staan meteen online`}
        actions={
          <>
            <button type="button" onClick={() => setImporteren(true)} className={btn.secondary}>
              <IStore width={16} height={16} /> Uit ZekerFlex-webshop
            </button>
            <Link href="/studio/producten/nieuw" className={btn.primary}>
              <IPlus width={16} height={16} /> Product toevoegen
            </Link>
          </>
        }
      />
      {fout && <p role="alert" className="mb-3 rounded-xl bg-[#fed1d7] px-4 py-2.5 text-sm text-[#8e0b21]">{fout}</p>}

      {winkel.producten.length === 0 ? (
        <Card>
          <Empty icon={<ITag />} title="Voeg je eerste product toe" text="Zet je producten met foto's, prijs en omschrijving in je eigen webshop. Klanten bestellen direct via je website.">
            <Link href="/studio/producten/nieuw" className={btn.primary}>Product toevoegen</Link>
            <button type="button" onClick={() => setImporteren(true)} className={btn.secondary}>Uit ZekerFlex-webshop</button>
          </Empty>
        </Card>
      ) : (
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-[#ebebeb] px-3 py-2">
            <div role="tablist" aria-label="Filter" className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === f.id ? "bg-[#ebebeb] text-[#1a1a1a]" : "text-[#616161] hover:bg-[#f7f7f7]"}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {cats.length > 0 && (
                <select aria-label="Categorie" value={cat} onChange={(e) => setCat(e.target.value)} className={`${input} w-auto py-1.5`}>
                  <option value="">Alle categorieën</option>
                  {cats.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              <label className="relative">
                <span className="sr-only">Zoek een product</span>
                <ISearch width={16} height={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#707070]" />
                <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoeken" className={`${input} w-44 py-1.5 pl-8`} />
              </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#ebebeb] bg-[#fafafa] text-left text-xs font-semibold text-[#616161]">
                  <th scope="col" className="px-4 py-2.5">Product</th>
                  <th scope="col" className="px-3 py-2.5">Status</th>
                  <th scope="col" className="px-3 py-2.5">Voorraad</th>
                  <th scope="col" className="px-3 py-2.5">Categorie</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Prijs</th>
                  {sorteerbaar && <th scope="col" className="px-3 py-2.5"><span className="sr-only">Volgorde</span></th>}
                </tr>
              </thead>
              <tbody>
                {lijst.map((p, i) => {
                  const foto = p.fotos[0] ? media.get(p.fotos[0]) : undefined;
                  return (
                    <tr key={p.id} onClick={() => router.push(`/studio/producten/${p.id}`)} className="cursor-pointer border-b border-[#f1f1f1] last:border-0 hover:bg-[#fafafa]">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {foto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/werkgever/sites/media/${foto.file}`} alt="" className="h-11 w-11 flex-shrink-0 rounded-lg border border-[#ebebeb] object-cover" />
                          ) : (
                            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg border border-dashed border-[#d4d4d4] text-[#a3a3a3]"><IImage width={18} height={18} /></span>
                          )}
                          <Link href={`/studio/producten/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-[#1a1a1a] hover:underline">{p.naam}</Link>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{p.zichtbaar ? <Pill tone="ok">Online</Pill> : <Pill>Verborgen</Pill>}</td>
                      <td className="px-3 py-2.5">
                        {isUitverkocht(p) ? (
                          <span className="font-medium text-[#b42318]">Uitverkocht</span>
                        ) : p.voorraad != null ? (
                          <span className={p.voorraad <= 5 ? "font-medium text-[#8a4b00]" : "text-[#616161]"}>{p.voorraad} op voorraad</span>
                        ) : (
                          <span className="text-[#616161]">Op voorraad</span>
                        )}
                        {p.opties?.length ? <span className="block text-xs text-[#707070]">{p.opties.map((o) => `${o.waarden.length} ${o.naam.toLowerCase()}`).join(" · ")}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-[#616161]">{p.categorie || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-[#1a1a1a]">
                        {p.oudePrijsCents && p.oudePrijsCents > p.prijsCents && <s className="mr-1.5 font-normal text-[#707070]">{euro(p.oudePrijsCents)}</s>}
                        {euro(p.prijsCents)}
                      </td>
                      {sorteerbaar && (
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <button type="button" aria-label={`${p.naam} hoger zetten`} disabled={i === 0} onClick={() => void verplaats(p.id, -1)} className="rounded px-1.5 text-[#616161] hover:bg-black/5 disabled:opacity-30">↑</button>
                          <button type="button" aria-label={`${p.naam} lager zetten`} disabled={i === lijst.length - 1} onClick={() => void verplaats(p.id, 1)} className="rounded px-1.5 text-[#616161] hover:bg-black/5 disabled:opacity-30">↓</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lijst.length === 0 && <p className="px-5 py-8 text-center text-sm text-[#616161]">Geen producten gevonden met dit filter.</p>}
          </div>
        </Card>
      )}

      {importeren && <ImportVenster onClose={() => setImporteren(false)} />}
    </>
  );
}

interface Catalogus {
  id: string;
  naam: string;
  prijsCents: number;
  categorie: string;
  beeld: string | null;
}

/** Producten uit de ZekerFlex-webshop overnemen, met foto; daarna is alles aan te passen. */
function ImportVenster({ onClose }: { onClose: () => void }) {
  const { winkel, saveWinkel, addMedia } = useStudio();
  const [lijst, setLijst] = useState<Catalogus[] | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<string[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/werkgever/sites/zekerflex-producten", { cache: "no-store" })
      .then(async (r) => (r.ok ? setLijst(((await r.json()) as { producten: Catalogus[] }).producten) : setFout(await foutVan(r, "De ZekerFlex-webshop kon niet laden."))))
      .catch(() => setFout("De ZekerFlex-webshop kon niet laden."));
  }, []);
  const voegToe = async (id: string) => {
    setBezig(id);
    setFout(null);
    const res = await fetch("/api/werkgever/sites/zekerflex-producten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    if (!res?.ok) {
      setBezig(null);
      return setFout(await foutVan(res, "Toevoegen lukte niet."));
    }
    const d = (await res.json()) as { product: SiteProduct; media: Media | null };
    if (d.media) addMedia(d.media);
    const err = await saveWinkel({ ...winkel, producten: [...winkel.producten, { ...d.product, slug: productSlug(d.product.naam, winkel.producten.map((x) => x.slug)) }] });
    setBezig(null);
    if (err) return setFout(err);
    setKlaar((k) => [...k, id]);
  };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="import-titel" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-[#ebebeb] px-5 py-3.5">
          <h2 id="import-titel" className="flex-1 font-semibold text-[#1a1a1a]">Uit de ZekerFlex-webshop</h2>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5"><IX width={16} height={16} /></button>
        </header>
        <p className="px-5 pt-3 text-sm text-[#616161]">Neem een product over met foto, prijs en omschrijving. Daarna is het een gewoon product van jouw winkel: alles is aan te passen.</p>
        {fout && <p role="alert" className="mx-5 mt-3 rounded-xl bg-[#fed1d7] px-3 py-2 text-sm text-[#8e0b21]">{fout}</p>}
        <ul className="mt-2 flex-1 divide-y divide-[#f1f1f1] overflow-y-auto px-2 pb-3">
          {!lijst && !fout && <li className="m-3 h-20 animate-pulse rounded-xl bg-[#f1f1f1]" />}
          {lijst?.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-3 py-2.5">
              {x.beeld ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.beeld} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg border border-[#ebebeb] object-cover" />
              ) : (
                <span className="h-12 w-12 flex-shrink-0 rounded-lg bg-[#f1f1f1]" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#1a1a1a]">{x.naam}</span>
                <span className="block text-xs text-[#616161]">{x.categorie} · {euro(x.prijsCents)}</span>
              </span>
              <button type="button" disabled={bezig !== null} onClick={() => void voegToe(x.id)} className={btn.secondary}>
                {bezig === x.id ? "Bezig…" : klaar.includes(x.id) ? "Toegevoegd ✓" : "Toevoegen"}
              </button>
            </li>
          ))}
          {lijst?.length === 0 && <li className="px-3 py-6 text-center text-sm text-[#616161]">De ZekerFlex-webshop heeft nu geen producten.</li>}
        </ul>
      </div>
    </div>
  );
}
