"use client";

import { useState } from "react";
import { kanZichtbaarWorden } from "@/lib/shop/media-product";
import { centenNaarEuro, effectieveVoorraad, heeftWijziging, snelWijziging, voorraadInLijst } from "@/lib/shop/product-formulier";

// Beheer -> Webshop -> Producten: zichtbaar, voorraad en prijs snel aanpassen IN de lijst, per rij opslaan. Hergebruikt de bestaande
// opslaan-routes (PATCH /api/shop/products/:id en, bij één variant, PATCH .../variants/:variantId) en geeft de teruggegeven serverversie door
// aan de lijst; er wordt niets lokaal "bijgewerkt". Eén variant: de voorraad gaat naar die variant, want daar kijkt de bestelling naar.
// Meerdere varianten (maten, kleuren): de voorraad staat per variant, via de knop Varianten.

export interface SnelProduct {
  id: string;
  name: string;
  priceCents: number;
  costCents: number | null;
  stock: number;
  active: boolean;
  imageUrl: string | null;
  category: string;
  variants: { id: string; stock: number }[];
}

interface Props {
  product: SnelProduct;
  /** de teruggegeven serverversie van het product (en de variant), om in de lijst over te nemen */
  onBijgewerkt: (product: Record<string, unknown>, variant: Record<string, unknown> | null) => void;
  onMelding: (tekst: string) => void;
}

export function ShopSnelCellen({ product, onBijgewerkt, onMelding }: Props) {
  const [prijsTekst, setPrijsTekst] = useState(centenNaarEuro(product.priceCents));
  const [voorraadTekst, setVoorraadTekst] = useState(String(effectieveVoorraad(product)));
  const [actief, setActief] = useState(product.active);
  const [bezig, setBezig] = useState(false);
  const [fouten, setFouten] = useState<string[]>([]);

  const wijziging = snelWijziging(product, { prijsTekst, voorraadTekst, actief });
  const gewijzigd = heeftWijziging(wijziging);

  const bewaar = async () => {
    const w = snelWijziging(product, { prijsTekst, voorraadTekst, actief });
    if (w.fouten.length > 0) { setFouten(w.fouten); return; }
    // een product zonder foto of prijs mag niet zichtbaar worden (dezelfde regel als in het formulier)
    if (w.product.active === true) {
      const nee = kanZichtbaarWorden({ imageUrl: product.imageUrl, priceCents: w.product.priceCents ?? product.priceCents });
      if (nee) { setFouten([nee]); return; }
    }
    setBezig(true);
    setFouten([]);
    try {
      let serverProduct: Record<string, unknown> = {};
      let serverVariant: Record<string, unknown> | null = null;
      if (Object.keys(w.product).length > 0) {
        const r = await fetch(`/api/shop/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(w.product) });
        const d = (await r.json().catch(() => null)) as { product?: Record<string, unknown>; error?: { message?: string } } | null;
        if (!r.ok || !d?.product) { setFouten([d?.error?.message ?? "Opslaan mislukt."]); return; }
        serverProduct = d.product;
      }
      if (w.variant) {
        const r = await fetch(`/api/shop/products/${product.id}/variants/${w.variant.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stock: w.variant.stock }) });
        const d = (await r.json().catch(() => null)) as { variant?: Record<string, unknown>; error?: { message?: string } } | null;
        if (!r.ok || !d?.variant) { setFouten([d?.error?.message ?? "De voorraad opslaan mislukte."]); return; }
        serverVariant = d.variant;
      }
      onBijgewerkt(serverProduct, serverVariant);
      onMelding(`"${product.name}" is bijgewerkt.`);
    } catch {
      setFouten(["Geen verbinding. Probeer het zo opnieuw."]);
    } finally {
      setBezig(false);
    }
  };

  const veld = "a-input w-24 text-right";
  return (
    <>
      <td className="px-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={actief}
          aria-label={`${product.name}: ${actief ? "zichtbaar in de winkel" : "niet zichtbaar in de winkel"}`}
          onClick={() => setActief(!actief)}
          className="a-button text-xs"
          style={actief ? { borderColor: "var(--a-ok)", color: "var(--a-ok)" } : undefined}
        >
          {actief ? "Zichtbaar" : "Verborgen"}
        </button>
      </td>
      <td className="px-4 py-3" style={{ color: "var(--a-text)" }}>
        {voorraadInLijst(product) ? (
          <label className="flex items-center gap-1.5 text-xs">
            <span className="sr-only">Voorraad van {product.name}</span>
            <input className={veld} inputMode="numeric" value={voorraadTekst} onChange={(e) => setVoorraadTekst(e.target.value)} aria-label={`Voorraad van ${product.name}`} />
            <span style={{ color: "var(--a-mute)" }}>stuks</span>
          </label>
        ) : (
          <span className="text-xs">{effectieveVoorraad(product)} stuks <span style={{ color: "var(--a-mute)" }}>· per variant, kies Varianten</span></span>
        )}
      </td>
      <td className="px-4 py-3" style={{ color: "var(--a-dim)" }}>{product.category}</td>
      <td className="px-4 py-3 text-right" style={{ color: "var(--a-text)" }}>
        <label className="inline-flex items-center gap-1 text-xs">
          <span aria-hidden>€</span>
          <span className="sr-only">Prijs van {product.name} in euro</span>
          <input className={veld} inputMode="decimal" value={prijsTekst} onChange={(e) => setPrijsTekst(e.target.value)} aria-label={`Prijs van ${product.name} in euro`} />
        </label>
        {gewijzigd ? (
          <button type="button" className="a-button a-button-primary mt-1.5 block text-xs" disabled={bezig} onClick={() => void bewaar()}>{bezig ? "Bezig…" : "Opslaan"}</button>
        ) : null}
        {fouten.map((f) => <p key={f} role="alert" className="mt-1 text-xs" style={{ color: "var(--a-crit)" }}>{f}</p>)}
      </td>
    </>
  );
}