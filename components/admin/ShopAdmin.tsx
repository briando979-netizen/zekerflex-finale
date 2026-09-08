"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceCents: number;
  costCents: number | null;
  stock: number;
  imageUploadId: string | null;
  modelUploadId: string | null;
  imageUrl: string | null;
  modelPhotoUrl: string | null;
  badge: string | null;
  active: boolean;
  sortOrder: number;
};

type FormState = Omit<Product, "id" | "imageUploadId" | "modelUploadId"> & { imageUploadId?: string | null; modelUploadId?: string | null };
const empty: FormState = { name: "", slug: "", description: "", category: "Werkdag", priceCents: 0, costCents: null, stock: 0, imageUrl: null, modelPhotoUrl: null, badge: null, active: true, sortOrder: 0 };

const marge = (priceCents: number, costCents: number | null) =>
  costCents && priceCents ? `${Math.round((1 - costCents / priceCents) * 100)}%` : "—";

export function ShopAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<"image" | "model" | null>(null);

  const load = async () => {
    const response = await fetch("/api/shop/products", { headers: { "x-shop-admin": "true" }, cache: "no-store" });
    const data = await response.json();
    if (response.ok) setProducts(data.products);
    else setMessage(data?.error?.message ?? "Producten konden niet worden geladen.");
  };
  useEffect(() => { void load(); }, []);

  const set = (key: keyof FormState, value: string | number | boolean | null) => setForm((current) => ({ ...current, [key]: value }));

  const upload = async (file: File, field: "imageUploadId" | "modelUploadId", urlField: "imageUrl" | "modelPhotoUrl") => {
    setUploading(field === "imageUploadId" ? "image" : "model");
    const body = new FormData(); body.append("file", file);
    const response = await fetch("/api/uploads", { method: "POST", body });
    const data = await response.json();
    setUploading(null);
    if (!response.ok) { setMessage(data?.error?.message ?? "Upload mislukt."); return; }
    set(field, data.upload.id);
    set(urlField, `/api/shop/media/${data.upload.id}`);
    setMessage("Foto geüpload. Sla het product op om de koppeling te bewaren.");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage("");
    const response = await fetch(editing ? `/api/shop/products/${editing}` : "/api/shop/products", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) { setMessage(data?.error?.message ?? "Opslaan mislukt."); return; }
    setMessage(editing ? "Product bijgewerkt." : "Product aangemaakt en gepubliceerd."); setForm(empty); setEditing(null); await load();
  };

  const edit = (product: Product) => { setEditing(product.id); setForm(product); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const archive = async (id: string) => { if (!window.confirm("Dit product verbergen uit de shop?")) return; await fetch(`/api/shop/products/${id}`, { method: "DELETE" }); await load(); };

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="a-panel flex flex-col gap-3 p-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="a-kicker">Commerce / catalogus</p><h1 className="a-title mt-2">Webshopbeheer</h1><p className="a-subtitle mt-1">Beheer assortiment, voorraad en alle beeldmaterialen van ZekerFlex.</p></div><a href="/shop" target="_blank" rel="noreferrer" className="a-button">Bekijk publieke shop ↗</a></header>
    <form onSubmit={save} className="a-panel grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="a-label">Productnaam<input className="a-input" value={form.name} onChange={(e) => set("name", e.target.value)} required /></label><label className="a-label">Slug<input className="a-input" value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="shift-bottle" required /></label></div><label className="a-label">Beschrijving<textarea className="a-input min-h-28" value={form.description} onChange={(e) => set("description", e.target.value)} required minLength={10} /></label><div className="grid gap-4 sm:grid-cols-4"><label className="a-label">Categorie<select className="a-input" value={form.category} onChange={(e) => set("category", e.target.value)}><option>Kleding</option><option>Werkdag</option><option>Cadeaus</option></select></label><label className="a-label">Verkoop (centen)<input className="a-input" type="number" min="0" value={form.priceCents} onChange={(e) => set("priceCents", Number(e.target.value))} required /></label><label className="a-label">Inkoop (centen)<input className="a-input" type="number" min="0" value={form.costCents ?? ""} onChange={(e) => set("costCents", e.target.value === "" ? null : Number(e.target.value))} placeholder="optioneel" /><span className="mt-1 block text-xs" style={{ color: "var(--a-mute)" }}>Marge: {marge(form.priceCents, form.costCents)}</span></label><label className="a-label">Voorraad<input className="a-input" type="number" min="0" value={form.stock} onChange={(e) => set("stock", Number(e.target.value))} required /></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="a-label">Badge<input className="a-input" value={form.badge ?? ""} onChange={(e) => set("badge", e.target.value || null)} placeholder="Nieuw" /></label><label className="a-label">Volgorde<input className="a-input" type="number" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></label></div><label className="flex items-center gap-3 text-sm" style={{ color: "var(--a-text)" }}><input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Zichtbaar in de publieke shop</label></div>
      <div className="space-y-4"><ImageUpload label="Productfoto" value={form.imageUrl} busy={uploading === "image"} onUpload={(file) => upload(file, "imageUploadId", "imageUrl")} /><ImageUpload label="Model-foto" value={form.modelPhotoUrl} busy={uploading === "model"} onUpload={(file) => upload(file, "modelUploadId", "modelPhotoUrl")} /><div className="flex gap-3 pt-2"><button className="a-button a-button-primary" type="submit">{editing ? "Wijzigingen opslaan" : "Product publiceren"}</button>{editing && <button className="a-button" type="button" onClick={() => { setEditing(null); setForm(empty); }}>Annuleren</button>}</div>{message && <p className="text-sm" style={{ color: "var(--a-dim)" }}>{message}</p>}</div>
    </form>
    <section className="a-panel overflow-hidden"><div className="border-b p-6" style={{ borderColor: "var(--a-border)" }}><p className="a-kicker">Live catalogus</p><h2 className="mt-2 font-display text-xl font-semibold" style={{ color: "var(--a-text)" }}>{products.length} producten beheerd</h2></div><div className="divide-y" style={{ borderColor: "var(--a-border)" }}>{products.map((product) => <div key={product.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="h-20 w-20 overflow-hidden rounded-xl" style={{ background: "var(--a-panel-2)" }}>{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center font-mono text-xs" style={{ color: "var(--a-mute)" }}>ZF</div>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold" style={{ color: "var(--a-text)" }}>{product.name}</h3><span className="a-tag">{product.category}</span><span className={`a-tag ${product.active ? "a-tag-ok" : ""}`}>{product.active ? "Live" : "Verborgen"}</span></div><p className="mt-1 text-sm" style={{ color: "var(--a-dim)" }}>{product.stock} op voorraad · € {(product.priceCents / 100).toFixed(2).replace(".", ",")}{product.costCents ? ` · inkoop € ${(product.costCents / 100).toFixed(2).replace(".", ",")} (marge ${marge(product.priceCents, product.costCents)})` : ""} · {product.modelPhotoUrl ? "model-foto gekoppeld" : "zonder model-foto"}</p></div><div className="flex gap-2"><button type="button" className="a-button" onClick={() => edit(product)}>Bewerken</button>{product.active && <button type="button" className="a-button" onClick={() => archive(product.id)}>Verbergen</button>}</div></div>)}</div></section>
  </div>;
}

function ImageUpload({ label, value, busy, onUpload }: { label: string; value: string | null | undefined; busy: boolean; onUpload: (file: File) => void }) {
  return <label className="a-label">{label}<div className="mt-2 overflow-hidden rounded-xl border border-dashed p-3" style={{ borderColor: "var(--a-border-strong)" }}>{value ? <img src={value} alt="Voorbeeld" className="mb-3 h-36 w-full rounded-lg object-cover" /> : <div className="mb-3 grid h-36 place-items-center rounded-lg" style={{ background: "var(--a-panel-2)", color: "var(--a-mute)" }}>Nog geen foto</div>}<span className="a-button inline-flex">{busy ? "Uploaden…" : "Kies foto"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file); }} /></span></div></label>;
}
