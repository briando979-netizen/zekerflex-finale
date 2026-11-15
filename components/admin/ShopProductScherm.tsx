"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { centenNaarEuro, euroNaarCenten, slugUitNaam, uniekeSlug } from "@/lib/shop/product-formulier";
import {
  CATEGORIEEN,
  KLEUR_SNEL,
  MAAT_SETS,
  MAX_FOTOS,
  fotosNaarProduct,
  fotosVanProduct,
  matenEnKleuren,
  schermFouten,
  uniekeLijst,
  variantRijen,
  variantSleutel,
  verplaats,
  voorraadUit,
  type Categorie,
  type VariantRij,
} from "@/lib/shop/product-scherm";

// ---------------------------------------------------------------------------
// Beheer → Webshop: één scherm om een product te plaatsen of te wijzigen (15 nov 2026, eigenaar: "het is moeilijk een product
// te plaatsen; ik moet ook meerdere foto's kunnen uploaden"). Van boven naar beneden: foto's (meerdere tegelijk kiezen of
// slepen, de eerste is de hoofdfoto, volgorde met slepen of de pijltjes), naam en prijs, omschrijving (de Winkel-AI kan
// helpen), categorie, maten en kleuren met de voorraad per combinatie, en zichtbaar in de shop. Rechts zie je meteen hoe het
// in de shop staat. Eén knop bewaart alles: het product, de foto's en de maten (PUT /api/shop/products/:id/variants).
// ---------------------------------------------------------------------------

export interface SchermProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceCents: number;
  costCents: number | null;
  imageUrl: string | null;
  fotos?: string[];
  modelPhotoUrl: string | null;
  badge: string | null;
  active: boolean;
  gender: string | null;
  collection: string | null;
  variants: { id: string; size: string | null; color: string | null; stock: number }[];
}

interface Foto {
  /** de url zoals hij bewaard wordt (/api/shop/media/<id>); leeg zolang hij nog uploadt */
  url: string;
  /** een voorbeeld uit de browser: een nieuwe upload is pas na het bewaren via de shop te zien */
  voorbeeld?: string;
  bezig?: boolean;
  fout?: string;
  sleutel: string;
}

const geld = (cent: number) => `€ ${(cent / 100).toFixed(2).replace(".", ",")}`;

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!r.ok || !d) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d;
}

/** Chips met een invoerveld: Enter of komma voegt toe, × haalt weg. Los onderdeel (niet binnen het scherm gedefinieerd). */
function Chips({ label, waarden, onChange, voorstellen, max, plaatshouder }: { label: string; waarden: string[]; onChange: (w: string[]) => void; voorstellen: readonly string[]; max: number; plaatshouder: string }) {
  const [invoer, setInvoer] = useState("");
  const voegToe = (tekst: string) => {
    const nieuw = uniekeLijst([...waarden, ...tekst.split(",")], max);
    onChange(nieuw);
    setInvoer("");
  };
  const toets = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && invoer.trim()) {
      e.preventDefault();
      voegToe(invoer);
    } else if (e.key === "Backspace" && !invoer && waarden.length) onChange(waarden.slice(0, -1));
  };
  const nogTeKiezen = voorstellen.filter((v) => !waarden.some((w) => w.toLowerCase() === v.toLowerCase()));
  return (
    <div>
      <p className="a-label">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border px-2 py-1.5" style={{ borderColor: "var(--a-border-strong)", background: "var(--a-panel)" }}>
        {waarden.map((w) => (
          <span key={w} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--a-panel-2)", color: "var(--a-text)" }}>
            {w}
            <button type="button" onClick={() => onChange(waarden.filter((x) => x !== w))} aria-label={`${w} weghalen`} className="leading-none opacity-70 hover:opacity-100">
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          onKeyDown={toets}
          onBlur={() => invoer.trim() && voegToe(invoer)}
          placeholder={waarden.length ? "" : plaatshouder}
          aria-label={label}
        />
      </div>
      {nogTeKiezen.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {nogTeKiezen.map((v) => (
            <button key={v} type="button" className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--a-border)", color: "var(--a-dim)" }} onClick={() => voegToe(v)}>
              + {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShopProductScherm({
  product,
  bestaandeSlugs,
  onKlaar,
  onAnnuleer,
  onVanLink,
  onGeavanceerd,
}: {
  /** null = een nieuw product */
  product: SchermProduct | null;
  bestaandeSlugs: string[];
  onKlaar: (melding: string) => void;
  onAnnuleer: () => void;
  /** een product overnemen van een leverancierslink (de bestaande hulp in drie stappen) */
  onVanLink?: () => void;
  /** het uitgebreide formulier (webadres, model-foto, 3D-model, volgorde) voor een bestaand product */
  onGeavanceerd?: () => void;
}) {
  const nieuw = !product;
  const start = product ? matenEnKleuren(product.variants) : { maten: [], kleuren: [] };
  const [fotos, setFotos] = useState<Foto[]>(() => (product ? fotosVanProduct(product).map((url, i) => ({ url, sleutel: `b${i}` })) : []));
  const [naam, setNaam] = useState(product?.name ?? "");
  const [omschrijving, setOmschrijving] = useState(product?.description ?? "");
  const [prijsTekst, setPrijsTekst] = useState(product ? centenNaarEuro(product.priceCents) : "");
  const [inkoopTekst, setInkoopTekst] = useState(product?.costCents != null ? centenNaarEuro(product.costCents) : "");
  const [categorie, setCategorie] = useState<Categorie>((CATEGORIEEN as readonly string[]).includes(product?.category ?? "") ? (product!.category as Categorie) : "Kleding");
  const [doelgroep, setDoelgroep] = useState(product?.gender ?? "");
  const [collectie, setCollectie] = useState(product?.collection ?? "");
  const [badge, setBadge] = useState(product?.badge ?? "");
  const [maten, setMaten] = useState<string[]>(start.maten);
  const [kleuren, setKleuren] = useState<string[]>(start.kleuren);
  const [metMaten, setMetMaten] = useState(start.maten.length > 0 || start.kleuren.length > 0);
  // voorraad per combinatie (sleutel maat|kleur); een product zonder maten heeft er één
  const [voorraad, setVoorraad] = useState<Record<string, string>>(() => Object.fromEntries((product?.variants ?? []).map((v) => [variantSleutel(v.size, v.color), String(v.stock)])));
  const [allemaal, setAllemaal] = useState("");
  const [zichtbaar, setZichtbaar] = useState(product ? product.active : true);
  const [meer, setMeer] = useState(false);
  const [bezig, setBezig] = useState("");
  const [fouten, setFouten] = useState<string[]>([]);
  const [sleepOver, setSleepOver] = useState(false);
  const [gesleept, setGesleept] = useState<number | null>(null);
  const kiesRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const teller = useRef(0);

  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);
  // voorbeelden uit de browser opruimen
  useEffect(
    () => () => {
      for (const f of fotosRef.current) if (f.voorbeeld) URL.revokeObjectURL(f.voorbeeld);
    },
    [],
  );

  const rijen: VariantRij[] = variantRijen(metMaten ? maten : [], metMaten ? kleuren : [], [], 0).map((r) => ({
    ...r,
    stock: voorraadUit(voorraad[variantSleutel(r.size, r.color)] ?? ""),
  }));
  const totaal = rijen.reduce((s, r) => s + r.stock, 0);
  const prijs = euroNaarCenten(prijsTekst);
  const klaarFotos = fotos.filter((f) => f.url && !f.bezig && !f.fout);

  // ── foto's
  const uploaden = async (bestanden: FileList | File[]) => {
    const lijst = [...bestanden].filter((b) => b.type.startsWith("image/"));
    const ruimte = MAX_FOTOS - fotosRef.current.length;
    if (lijst.length > ruimte) setFouten([`Hooguit ${MAX_FOTOS} foto's per product; de eerste ${Math.max(0, ruimte)} worden toegevoegd.`]);
    const nieuwe = lijst.slice(0, Math.max(0, ruimte)).map((b) => ({ bestand: b, foto: { url: "", voorbeeld: URL.createObjectURL(b), bezig: true, sleutel: `n${teller.current++}` } as Foto }));
    if (!nieuwe.length) return;
    setFotos((f) => [...f, ...nieuwe.map((n) => n.foto)]);
    await Promise.all(
      nieuwe.map(async ({ bestand, foto }) => {
        const body = new FormData();
        body.append("file", bestand);
        try {
          const d = await json<{ upload: { id: string } }>("/api/uploads", { method: "POST", body });
          setFotos((f) => f.map((x) => (x.sleutel === foto.sleutel ? { ...x, url: `/api/shop/media/${d.upload.id}`, bezig: false } : x)));
        } catch (e) {
          setFotos((f) => f.map((x) => (x.sleutel === foto.sleutel ? { ...x, bezig: false, fout: (e as Error).message } : x)));
        }
      }),
    );
  };
  const weg = (i: number) =>
    setFotos((f) => {
      const x = f[i];
      if (x?.voorbeeld) URL.revokeObjectURL(x.voorbeeld);
      return f.filter((_, j) => j !== i);
    });
  const naarPlek = (van: number, naar: number) => setFotos((f) => verplaats(f, van, naar));
  const opDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSleepOver(false);
    if (e.dataTransfer.files.length) void uploaden(e.dataTransfer.files);
  };

  // ── de Winkel-AI schrijft een omschrijving uit naam en wat er al staat
  const schrijfOmschrijving = async () => {
    if (naam.trim().length < 2) {
      setFouten(["Geef het product eerst een naam; daar maakt de Winkel-AI de omschrijving van."]);
      return;
    }
    setBezig("omschrijving");
    setFouten([]);
    try {
      const d = await json<{ concept: { description: string; category: Categorie } }>("/api/admin/shop-ai/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idee: `${naam.trim()}\n${omschrijving.trim()}`.slice(0, 1500) }),
      });
      setOmschrijving(d.concept.description);
      if ((CATEGORIEEN as readonly string[]).includes(d.concept.category) && nieuw) setCategorie(d.concept.category);
    } catch (e) {
      setFouten([(e as Error).message]);
    } finally {
      setBezig("");
    }
  };

  // ── bewaren: product (met foto's) en daarna alle maten en kleuren in één keer
  const bewaar = async (inDeShop: boolean) => {
    if (fotos.some((f) => f.bezig)) {
      setFouten(["Even wachten: er worden nog foto's geüpload."]);
      return;
    }
    const f = schermFouten({ naam, omschrijving, prijsTekst, categorie, fotos: klaarFotos.map((x) => x.url), varianten: rijen, zichtbaar: inDeShop });
    setFouten(f);
    if (f.length) return;
    setBezig(inDeShop ? "plaatsen" : "concept");
    const verdeeld = fotosNaarProduct(klaarFotos.map((x) => x.url));
    const inkoop = euroNaarCenten(inkoopTekst);
    const velden = {
      name: naam.trim(),
      description: omschrijving.trim(),
      category: categorie,
      gender: doelgroep ? doelgroep : null,
      collection: collectie.trim() || null,
      priceCents: prijs ?? 0,
      costCents: inkoopTekst.trim() && inkoop !== null ? inkoop : null,
      stock: totaal,
      imageUrl: verdeeld.imageUrl,
      imageUploadId: verdeeld.imageUploadId,
      fotos: verdeeld.fotos,
      badge: badge.trim() || null,
      active: inDeShop,
    };
    try {
      const opgeslagen = product
        ? await json<{ product: { id: string } }>(`/api/shop/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(velden) })
        : await json<{ product: { id: string } }>("/api/shop/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...velden, slug: uniekeSlug(slugUitNaam(naam), bestaandeSlugs), isBundle: false, sortOrder: 0 }),
          });
      await json("/api/shop/products/" + opgeslagen.product.id + "/variants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ varianten: rijen }),
      });
      onKlaar(inDeShop ? `"${naam.trim()}" staat in de shop.` : `"${naam.trim()}" is bewaard als concept (verborgen).`);
    } catch (e) {
      setFouten([(e as Error).message]);
    } finally {
      setBezig("");
    }
  };

  const voorbeeldFoto = klaarFotos[0]?.voorbeeld ?? klaarFotos[0]?.url ?? fotos[0]?.voorbeeld;

  return (
    <section className="a-panel" aria-labelledby="product-scherm-titel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--a-border)" }}>
        <div>
          <h2 id="product-scherm-titel" className="text-base font-semibold" style={{ color: "var(--a-text)" }}>
            {nieuw ? "Nieuw product" : `${product.name} wijzigen`}
          </h2>
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>
            Foto&apos;s, naam, prijs en maten in één keer. Rechts zie je hoe het in de shop staat.
          </p>
        </div>
        {nieuw && onVanLink && (
          <button type="button" className="a-button text-xs" onClick={onVanLink}>
            Van een leverancierslink
          </button>
        )}
        {!nieuw && onGeavanceerd && (
          <button type="button" className="a-button text-xs" onClick={onGeavanceerd}>
            Webadres, model-foto en 3D
          </button>
        )}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          {/* ── 1. foto's */}
          <div>
            <p className="a-label">Foto&apos;s <span style={{ color: "var(--a-mute)" }}>({fotos.length}/{MAX_FOTOS}, de eerste is de hoofdfoto)</span></p>
            <div
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  setSleepOver(true);
                }
              }}
              onDragLeave={() => setSleepOver(false)}
              onDrop={opDrop}
              className="mt-1.5 rounded-xl border-2 border-dashed p-3 transition"
              style={{ borderColor: sleepOver ? "var(--a-accent)" : "var(--a-border-strong)", background: sleepOver ? "var(--a-panel-2)" : undefined }}
            >
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {fotos.map((f, i) => (
                  <li
                    key={f.sleutel}
                    draggable={!f.bezig}
                    onDragStart={(e) => {
                      setGesleept(i);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (gesleept !== null) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (gesleept === null) return;
                      e.preventDefault();
                      e.stopPropagation();
                      naarPlek(gesleept, i);
                      setGesleept(null);
                    }}
                    onDragEnd={() => setGesleept(null)}
                    className="group relative aspect-square overflow-hidden rounded-lg border"
                    style={{ borderColor: i === 0 ? "var(--a-accent)" : "var(--a-border)", opacity: gesleept === i ? 0.4 : 1 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.voorbeeld ?? f.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">Hoofdfoto</span>}
                    {f.bezig && <span className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-semibold text-white">Uploaden…</span>}
                    {f.fout && (
                      <span role="alert" className="absolute inset-x-0 bottom-0 bg-red-700/90 px-1 py-0.5 text-[10px] text-white">
                        Mislukt: {f.fout}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/55 p-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <button type="button" disabled={i === 0} onClick={() => naarPlek(i, i - 1)} aria-label={`Foto ${i + 1} naar links`} className="rounded px-1.5 text-xs text-white disabled:opacity-30">
                        ←
                      </button>
                      {i > 0 && (
                        <button type="button" onClick={() => naarPlek(i, 0)} className="rounded px-1 text-[10px] font-semibold text-white" aria-label={`Foto ${i + 1} als hoofdfoto`}>
                          ★
                        </button>
                      )}
                      <button type="button" disabled={i === fotos.length - 1} onClick={() => naarPlek(i, i + 1)} aria-label={`Foto ${i + 1} naar rechts`} className="rounded px-1.5 text-xs text-white disabled:opacity-30">
                        →
                      </button>
                      <button type="button" onClick={() => weg(i)} aria-label={`Foto ${i + 1} weghalen`} className="rounded px-1.5 text-xs text-white">
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
                {fotos.length < MAX_FOTOS && (
                  <li className="aspect-square">
                    <button
                      type="button"
                      onClick={() => kiesRef.current?.click()}
                      className="grid h-full w-full place-items-center rounded-lg border text-center text-xs font-semibold"
                      style={{ borderColor: "var(--a-border)", color: "var(--a-dim)", background: "var(--a-panel-2)" }}
                    >
                      <span>
                        <span className="block text-2xl leading-none">+</span>
                        Foto&apos;s kiezen
                      </span>
                    </button>
                  </li>
                )}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--a-mute)" }}>
                <span>Sleep foto&apos;s hierheen of kies er meerdere tegelijk. Volgorde: slepen of de pijltjes; ★ maakt hoofdfoto.</span>
                <button type="button" className="a-button text-xs sm:hidden" onClick={() => cameraRef.current?.click()}>
                  Foto maken
                </button>
              </div>
              <input
                ref={kiesRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  if (e.target.files?.length) void uploaden(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  if (e.target.files?.length) void uploaden(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* ── 2. naam, prijs, omschrijving, categorie */}
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <label className="a-label">
              Naam
              <input className="a-input" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={120} placeholder="Bijv. Werkbroek met kniezakken" />
            </label>
            <label className="a-label">
              Prijs (€)
              <input className="a-input" value={prijsTekst} onChange={(e) => setPrijsTekst(e.target.value)} inputMode="decimal" placeholder="39,95" />
            </label>
          </div>
          <label className="a-label block">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>Omschrijving</span>
              <button type="button" className="a-button text-xs" disabled={bezig === "omschrijving"} onClick={() => void schrijfOmschrijving()}>
                {bezig === "omschrijving" ? "De Winkel-AI schrijft…" : "✨ Laat de Winkel-AI schrijven"}
              </button>
            </span>
            <textarea className="a-input mt-1.5 min-h-[6rem]" value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={600} placeholder="Wat is het, voor wie, en waarom is het goed?" />
            <span className="mt-1 block text-right text-[11px]" style={{ color: "var(--a-mute)" }}>{omschrijving.trim().length}/600</span>
          </label>
          <div>
            <p className="a-label">Categorie</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Categorie">
              {CATEGORIEEN.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={categorie === c}
                  onClick={() => setCategorie(c)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${categorie === c ? "font-semibold" : ""}`}
                  style={categorie === c ? { borderColor: "var(--a-accent)", background: "var(--a-panel-2)", color: "var(--a-text)" } : { borderColor: "var(--a-border)", color: "var(--a-dim)" }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* ── 3. maten, kleuren en voorraad */}
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--a-border)" }}>
            <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
              <input type="checkbox" checked={metMaten} onChange={(e) => setMetMaten(e.target.checked)} />
              Dit product heeft maten of kleuren
            </label>
            {metMaten ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs" style={{ color: "var(--a-mute)" }}>Snel kiezen:</span>
                  {MAAT_SETS.map((s) => (
                    <button key={s.naam} type="button" className="rounded-full border px-2.5 py-0.5 text-xs" style={{ borderColor: "var(--a-border)", color: "var(--a-dim)" }} onClick={() => setMaten(uniekeLijst([...maten, ...s.maten], 20))}>
                      {s.naam}
                    </button>
                  ))}
                </div>
                <Chips label="Maten" waarden={maten} onChange={setMaten} voorstellen={[]} max={20} plaatshouder="Typ een maat en druk op Enter, bijv. M" />
                <Chips label="Kleuren" waarden={kleuren} onChange={setKleuren} voorstellen={KLEUR_SNEL} max={40} plaatshouder="Typ een kleur en druk op Enter, bijv. Zwart" />
                {rijen.length > 0 && (maten.length > 0 || kleuren.length > 0) && (
                  <div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="a-label">
                        Zelfde voorraad voor alles
                        <input className="a-input w-28" value={allemaal} onChange={(e) => setAllemaal(e.target.value)} inputMode="numeric" placeholder="10" />
                      </label>
                      <button
                        type="button"
                        className="a-button text-xs"
                        onClick={() => setVoorraad((v) => ({ ...v, ...Object.fromEntries(rijen.map((r) => [variantSleutel(r.size, r.color), String(voorraadUit(allemaal))])) }))}
                      >
                        Toepassen
                      </button>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs" style={{ color: "var(--a-mute)" }}>
                            <th className="py-1 pr-3 font-medium">Maat</th>
                            <th className="py-1 pr-3 font-medium">Kleur</th>
                            <th className="py-1 font-medium">Voorraad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rijen.map((r) => {
                            const k = variantSleutel(r.size, r.color);
                            return (
                              <tr key={k} className="border-t" style={{ borderColor: "var(--a-border)" }}>
                                <td className="py-1.5 pr-3" style={{ color: "var(--a-text)" }}>{r.size ?? "—"}</td>
                                <td className="py-1.5 pr-3" style={{ color: "var(--a-text)" }}>{r.color ?? "—"}</td>
                                <td className="py-1.5">
                                  <input
                                    className="a-input w-24"
                                    value={voorraad[k] ?? ""}
                                    onChange={(e) => setVoorraad((v) => ({ ...v, [k]: e.target.value }))}
                                    inputMode="numeric"
                                    placeholder="0"
                                    aria-label={`Voorraad ${[r.size, r.color].filter(Boolean).join(" ")}`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <label className="a-label mt-3 block">
                Voorraad
                <input
                  className="a-input w-32"
                  value={voorraad[variantSleutel(null, null)] ?? ""}
                  onChange={(e) => setVoorraad((v) => ({ ...v, [variantSleutel(null, null)]: e.target.value }))}
                  inputMode="numeric"
                  placeholder="25"
                />
              </label>
            )}
            <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
              Totaal op voorraad: <strong style={{ color: "var(--a-text)" }}>{totaal}</strong>
              {metMaten && rijen.length > 1 ? ` in ${rijen.length} combinaties` : ""}
            </p>
          </div>

          {/* ── 4. meer (niet nodig om te plaatsen) */}
          <div>
            <button type="button" className="text-sm font-semibold" style={{ color: "var(--a-dim)" }} onClick={() => setMeer((m) => !m)} aria-expanded={meer}>
              {meer ? "▾" : "▸"} Meer opties (inkoopprijs, doelgroep, collectie, label)
            </button>
            {meer && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="a-label">
                  Inkoopprijs (€, niet zichtbaar voor klanten)
                  <input className="a-input" value={inkoopTekst} onChange={(e) => setInkoopTekst(e.target.value)} inputMode="decimal" placeholder="12,00" />
                </label>
                <label className="a-label">
                  Doelgroep
                  <select className="a-input" value={doelgroep} onChange={(e) => setDoelgroep(e.target.value)}>
                    <option value="">Iedereen</option>
                    <option value="heren">Heren</option>
                    <option value="vrouwen">Vrouwen</option>
                    <option value="kinderen">Kinderen</option>
                    <option value="unisex">Unisex</option>
                  </select>
                </label>
                <label className="a-label">
                  Collectie
                  <input className="a-input" value={collectie} onChange={(e) => setCollectie(e.target.value)} maxLength={60} placeholder="Bijv. Winter 2026" />
                </label>
                <label className="a-label">
                  Label op de foto
                  <input className="a-input" value={badge} onChange={(e) => setBadge(e.target.value)} maxLength={40} placeholder="Bijv. Nieuw" />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* ── rechts: zo staat het in de shop */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>Zo staat het in de shop</p>
          <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--a-border)" }}>
            <div className="relative aspect-square bg-neutral-100">
              {voorbeeldFoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={voorbeeldFoto} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-xs text-neutral-500">Nog geen foto</span>
              )}
              {badge.trim() && <span className="absolute left-2 top-2 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">{badge.trim()}</span>}
              {klaarFotos.length > 1 && <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">1/{klaarFotos.length}</span>}
            </div>
            <div className="p-3 text-neutral-900">
              <p className="text-sm font-semibold leading-snug">{naam.trim() || "Naam van het product"}</p>
              <p className="mt-1 text-sm font-bold">{prijs ? geld(prijs) : "€ —"}</p>
              {metMaten && maten.length > 0 && <p className="mt-1 text-xs text-neutral-500">Maten: {maten.join(", ")}</p>}
              {metMaten && kleuren.length > 0 && <p className="text-xs text-neutral-500">Kleuren: {kleuren.join(", ")}</p>}
              <p className={`mt-1 text-xs ${totaal > 0 ? "text-green-700" : "text-red-700"}`}>{totaal > 0 ? "Op voorraad" : "Uitverkocht"}</p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--a-text)" }}>
            <input type="checkbox" className="mt-0.5" checked={zichtbaar} onChange={(e) => setZichtbaar(e.target.checked)} />
            <span>
              Zichtbaar in de shop
              <span className="block text-xs" style={{ color: "var(--a-mute)" }}>Uit = concept: alleen jij ziet het.</span>
            </span>
          </label>
        </aside>
      </div>

      {fouten.length > 0 && (
        <div role="alert" className="mx-5 mb-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--a-crit)", color: "var(--a-crit)" }}>
          <ul className="list-disc space-y-0.5 pl-4">
            {fouten.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--a-border)", background: "var(--a-panel)" }}>
        <button type="button" className="a-button" onClick={onAnnuleer} disabled={Boolean(bezig) && bezig !== "omschrijving"}>
          Annuleren
        </button>
        {zichtbaar && (
          <button type="button" className="a-button" onClick={() => void bewaar(false)} disabled={Boolean(bezig)}>
            {bezig === "concept" ? "Bewaren…" : "Bewaar als concept"}
          </button>
        )}
        <button type="button" className="a-button a-button-primary" onClick={() => void bewaar(zichtbaar)} disabled={Boolean(bezig)}>
          {bezig === "plaatsen" || (bezig === "concept" && !zichtbaar) ? "Bewaren…" : zichtbaar ? (nieuw ? "Plaats in de shop" : "Opslaan") : "Opslaan als concept"}
        </button>
      </div>
    </section>
  );
}
