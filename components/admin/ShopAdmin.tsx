"use client";

import { Fragment, useEffect, useState } from "react";
import { ShopAdminTools } from "@/components/admin/ShopAdminTools";
import { ProductPlaceholder } from "@/components/marketing/ProductPlaceholder";

type Variant = { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number; sku: string };

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
  gender: string | null;
  collection: string | null;
  isBundle: boolean;
  variants: Variant[];
};

type FormState = Omit<Product, "id" | "imageUploadId" | "modelUploadId" | "variants"> & { imageUploadId?: string | null; modelUploadId?: string | null };
const empty: FormState = { name: "", slug: "", description: "", category: "Werkdag", priceCents: 0, costCents: null, stock: 0, imageUrl: null, modelPhotoUrl: null, badge: null, active: true, sortOrder: 0, gender: null, collection: null, isBundle: false };

type OrderStatus = "PENDING_PAYMENT" | "RECEIVED" | "CONFIRMED" | "SHIPPED" | "CANCELLED" | "PAYMENT_FAILED";
type Order = {
  id: string;
  status: OrderStatus;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  itemsJson: { productId: string; variantId?: string; name: string; priceCents: number; qty: number; size?: string | null; color?: string | null }[];
  totalCents: number;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
};
const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Wacht op betaling",
  RECEIVED: "Betaald",
  CONFIRMED: "Bevestigd",
  SHIPPED: "Verzonden",
  CANCELLED: "Geannuleerd",
  PAYMENT_FAILED: "Betaling mislukt",
};
// Shopify-achtige status-tint per orderstatus.
const ORDER_STATUS_TONE: Record<OrderStatus, { fg: string; bg: string }> = {
  PENDING_PAYMENT: { fg: "#9a6b00", bg: "rgba(234,179,8,0.16)" },
  RECEIVED: { fg: "#15803d", bg: "rgba(22,163,74,0.14)" },
  CONFIRMED: { fg: "#15803d", bg: "rgba(22,163,74,0.14)" },
  SHIPPED: { fg: "#1d4ed8", bg: "rgba(37,99,235,0.14)" },
  CANCELLED: { fg: "#b91c1c", bg: "rgba(220,38,38,0.14)" },
  PAYMENT_FAILED: { fg: "#b91c1c", bg: "rgba(220,38,38,0.14)" },
};

const money = (euros: number) => `€ ${euros.toFixed(2).replace(".", ",")}`;
const moneyCents = (cents: number) => money(cents / 100);

const marge = (priceCents: number, costCents: number | null) =>
  costCents && priceCents ? `${Math.round((1 - costCents / priceCents) * 100)}%` : "—";

export function ShopAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<"image" | "model" | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderMessage, setOrderMessage] = useState("");
  const [variantsOpen, setVariantsOpen] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState({ size: "", color: "", priceCents: "", stock: "0" });
  const [variantMessage, setVariantMessage] = useState("");
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [tab, setTab] = useState<"products" | "orders" | "stats" | "tools">("products");
  const [showForm, setShowForm] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatus | "">("");
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [pStatus, setPStatus] = useState<"all" | "live" | "hidden">("all");

  const load = async () => {
    const response = await fetch("/api/shop/products", { headers: { "x-shop-admin": "true" }, cache: "no-store" });
    const data = await response.json();
    if (response.ok) setProducts(data.products);
    else setMessage(data?.error?.message ?? "Producten konden niet worden geladen.");
  };
  const loadOrders = async () => {
    const response = await fetch("/api/shop/orders", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setOrders(data.orders);
    else setOrderMessage(data?.error?.message ?? "Bestellingen konden niet worden geladen.");
  };
  const loadStats = async () => {
    const response = await fetch("/api/shop/stats", { cache: "no-store" });
    if (response.ok) setStats(await response.json());
  };
  useEffect(() => { void load(); void loadOrders(); void loadStats(); }, []);

  const setOrderStatus = async (id: string, status: OrderStatus) => {
    const response = await fetch(`/api/shop/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json();
    if (!response.ok) { setOrderMessage(data?.error?.message ?? "Status bijwerken mislukt."); return; }
    await loadOrders();
    await loadStats();
  };
  const setOrderTracking = async (id: string, carrier: string, trackingNumber: string) => {
    const response = await fetch(`/api/shop/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carrier: carrier || null, trackingNumber: trackingNumber || null }),
    });
    const data = await response.json();
    if (!response.ok) { setOrderMessage(data?.error?.message ?? "Tracking bijwerken mislukt."); return; }
    await loadOrders();
  };

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
    setMessage(editing ? "Product bijgewerkt." : "Product aangemaakt en gepubliceerd."); setForm(empty); setEditing(null); setShowForm(false); await load(); void loadStats();
  };

  const edit = (product: Product) => { setEditing(product.id); setForm(product); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const newProduct = () => { setEditing(null); setForm(empty); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const archive = async (id: string) => { if (!window.confirm("Dit product verbergen uit de shop?")) return; await fetch(`/api/shop/products/${id}`, { method: "DELETE" }); await load(); void loadStats(); };

  const addVariant = async (productId: string) => {
    setVariantMessage("");
    const response = await fetch(`/api/shop/products/${productId}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size: variantForm.size || null,
        color: variantForm.color || null,
        priceCents: variantForm.priceCents === "" ? null : Number(variantForm.priceCents),
        stock: Number(variantForm.stock || 0),
      }),
    });
    const data = await response.json();
    if (!response.ok) { setVariantMessage(data?.error?.message ?? "Variant toevoegen mislukt."); return; }
    setVariantForm({ size: "", color: "", priceCents: "", stock: "0" });
    await load(); void loadStats();
  };
  const removeVariant = async (productId: string, variantId: string) => {
    await fetch(`/api/shop/products/${productId}/variants/${variantId}`, { method: "DELETE" });
    await load(); void loadStats();
  };

  const pq = productQuery.trim().toLowerCase();
  const shownProducts = products.filter(
    (p) =>
      (pStatus === "all" || (pStatus === "live" ? p.active : !p.active)) &&
      (!pq || p.name.toLowerCase().includes(pq) || p.slug.toLowerCase().includes(pq) || p.category.toLowerCase().includes(pq)),
  );
  const oq = orderQuery.trim().toLowerCase();
  const shownOrders = orders.filter(
    (o) =>
      (!orderStatusFilter || o.status === orderStatusFilter) &&
      (!oq || `${o.firstName} ${o.lastName}`.toLowerCase().includes(oq) || o.email.toLowerCase().includes(oq) || o.id.toLowerCase().includes(oq)),
  );

  const liveCount = products.filter((p) => p.active).length;

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--a-text)" }}>Webshop</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--a-mute)" }}>Producten, bestellingen, voorraad en statistieken.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="a-button" onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Verberg preview" : "Live preview"}</button>
        <a href="/shop" target="_blank" rel="noreferrer" className="a-button">Bekijk shop ↗</a>
        <button type="button" className="a-button a-button-primary" onClick={newProduct}>Product toevoegen</button>
      </div>
    </header>

    <div className="flex gap-6 border-b" style={{ borderColor: "var(--a-border)" }}>
      {([
        ["products", "Producten"],
        ["orders", "Bestellingen"],
        ["stats", "Statistieken"],
        ["tools", "Kortingen & voorraad"],
      ] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className="relative pb-3 text-sm font-medium transition"
          style={{ color: tab === key ? "var(--a-text)" : "var(--a-mute)" }}
        >
          {label}
          {["products", "orders"].includes(key) && (
            <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs" style={{ background: "var(--a-panel-2)", color: "var(--a-mute)" }}>
              {key === "products" ? products.length : orders.length}
            </span>
          )}
          {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: "var(--a-accent)" }} />}
        </button>
      ))}
    </div>

    {tab === "tools" && <ShopAdminTools />}

    {tab === "stats" && stats && (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Omzet (betaald, totaal)", moneyCents(stats.revenueCents)],
            ["Omzet laatste 30 dagen", moneyCents(stats.revenue30dCents)],
            ["Betaalde bestellingen", `${stats.paidOrderCount}`],
            ["Wacht op betaling", `${stats.pendingOrderCount}`],
          ].map(([label, value]) => (
            <div key={label} className="a-panel p-4">
              <p className="text-xs" style={{ color: "var(--a-mute)" }}>{label}</p>
              <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--a-text)" }}>{value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="a-panel p-5">
            <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Bestverkocht</p>
            {stats.topProducts.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--a-mute)" }}>Nog geen betaalde bestellingen.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {stats.topProducts.map((p) => (
                  <li key={p.name} className="flex justify-between" style={{ color: "var(--a-text)" }}>
                    <span>{p.name}</span>
                    <span style={{ color: "var(--a-mute)" }}>{p.qty}x · {moneyCents(p.revenueCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="a-panel p-5">
            <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Lage voorraad (≤ 5)</p>
            {stats.lowStock.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--a-mute)" }}>Niets kritiek — alle varianten hebben genoeg voorraad.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {stats.lowStock.map((v) => (
                  <li key={v.variantId} className="flex justify-between" style={{ color: "var(--a-text)" }}>
                    <span>{v.productName}{[v.size, v.color].filter(Boolean).length > 0 ? ` (${[v.size, v.color].filter(Boolean).join(", ")})` : ""}</span>
                    <span className={v.stock === 0 ? "font-semibold text-red-600" : ""} style={v.stock > 0 ? { color: "var(--a-mute)" } : undefined}>{v.stock} op voorraad</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    )}

    {showPreview && (
      <section className="a-panel overflow-hidden p-0">
        <div className="flex items-center justify-between border-b p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Live preview — /shop</p>
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>Dit is de echte, live site. Ververs na het opslaan van wijzigingen.</p>
        </div>
        <iframe src="/shop" title="Live preview van de shop" className="h-[600px] w-full border-0" />
      </section>
    )}

    {tab === "products" && showForm && (
    <form onSubmit={save} className="a-panel grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="a-label">Productnaam<input className="a-input" value={form.name} onChange={(e) => set("name", e.target.value)} required /></label><label className="a-label">Slug<input className="a-input" value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="shift-bottle" required /></label></div><label className="a-label">Beschrijving<textarea className="a-input min-h-28" value={form.description} onChange={(e) => set("description", e.target.value)} required minLength={10} /></label><div className="grid gap-4 sm:grid-cols-4"><label className="a-label">Categorie<select className="a-input" value={form.category} onChange={(e) => set("category", e.target.value)}><option>Werk & PBM</option><option>Kleding</option><option>Werkdag</option><option>Cadeaus</option></select></label><label className="a-label">Verkoop (centen)<input className="a-input" type="number" min="0" value={form.priceCents} onChange={(e) => set("priceCents", Number(e.target.value))} required /></label><label className="a-label">Inkoop (centen)<input className="a-input" type="number" min="0" value={form.costCents ?? ""} onChange={(e) => set("costCents", e.target.value === "" ? null : Number(e.target.value))} placeholder="optioneel" /><span className="mt-1 block text-xs" style={{ color: "var(--a-mute)" }}>Marge: {marge(form.priceCents, form.costCents)}</span></label><label className="a-label">Voorraad<input className="a-input" type="number" min="0" value={form.stock} onChange={(e) => set("stock", Number(e.target.value))} required /></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="a-label">Badge<input className="a-input" value={form.badge ?? ""} onChange={(e) => set("badge", e.target.value || null)} placeholder="Nieuw" /></label><label className="a-label">Volgorde<input className="a-input" type="number" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></label></div><div className="grid gap-4 sm:grid-cols-3"><label className="a-label">Geslacht<select className="a-input" value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value || null)}><option value="">— (geen)</option><option value="heren">Heren</option><option value="vrouwen">Vrouwen</option><option value="kinderen">Kinderen</option><option value="unisex">Unisex</option></select></label><label className="a-label">Collectie<input className="a-input" value={form.collection ?? ""} onChange={(e) => set("collection", e.target.value || null)} placeholder="Winter 2026" /></label><label className="flex items-center gap-3 pt-6 text-sm" style={{ color: "var(--a-text)" }}><input type="checkbox" checked={form.isBundle} onChange={(e) => set("isBundle", e.target.checked)} /> Is een bundel</label></div><label className="flex items-center gap-3 text-sm" style={{ color: "var(--a-text)" }}><input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Zichtbaar in de publieke shop</label></div>
      <div className="space-y-4"><ImageUpload label="Productfoto" value={form.imageUrl} busy={uploading === "image"} onUpload={(file) => upload(file, "imageUploadId", "imageUrl")} /><ImageUpload label="Model-foto" value={form.modelPhotoUrl} busy={uploading === "model"} onUpload={(file) => upload(file, "modelUploadId", "modelPhotoUrl")} /><div className="flex gap-3 pt-2"><button className="a-button a-button-primary" type="submit">{editing ? "Wijzigingen opslaan" : "Product publiceren"}</button><button className="a-button" type="button" onClick={() => { setEditing(null); setForm(empty); setShowForm(false); }}>Annuleren</button></div>{message && <p className="text-sm" style={{ color: "var(--a-dim)" }}>{message}</p>}</div>
    </form>
    )}

    {tab === "products" && (
    <section className="a-panel overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--a-border)" }}>
        <div className="flex gap-1">
          {([["all", `Alle (${products.length})`], ["live", `Live (${liveCount})`], ["hidden", `Verborgen (${products.length - liveCount})`]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPStatus(k)} className="rounded-lg px-3 py-1.5 text-sm font-medium transition" style={pStatus === k ? { background: "var(--a-panel-2)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}>{l}</button>
          ))}
        </div>
        <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Zoeken…" className="a-input ml-auto max-w-xs flex-1" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide" style={{ borderColor: "var(--a-border)", color: "var(--a-mute)" }}>
              <th className="px-4 py-2.5 font-semibold">Product</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Voorraad</th>
              <th className="px-4 py-2.5 font-semibold">Categorie</th>
              <th className="px-4 py-2.5 text-right font-semibold">Prijs</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shownProducts.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm" style={{ color: "var(--a-mute)" }}>Geen producten gevonden.</td></tr>
            )}
            {shownProducts.map((product) => (
              <Fragment key={product.id}>
                <tr className="group border-b" style={{ borderColor: "var(--a-border)" }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg" style={{ background: "var(--a-panel-2)" }}>
                        {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <ProductPlaceholder name={product.name} slug={product.slug} category={product.category} glyphSize={24} className="text-[color:var(--a-mute)]" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium" style={{ color: "var(--a-text)" }}>{product.name}</p>
                        <p className="truncate text-xs" style={{ color: "var(--a-mute)" }}>{[product.gender, product.collection, product.isBundle ? "bundel" : null, product.badge].filter(Boolean).join(" · ") || product.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusPill active={product.active} /></td>
                  <td className="px-4 py-3" style={{ color: "var(--a-text)" }}>
                    {product.stock} op voorraad{product.variants.length ? <span style={{ color: "var(--a-mute)" }}> · {product.variants.length} var.</span> : null}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--a-dim)" }}>{product.category}</td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: "var(--a-text)" }}>
                    {moneyCents(product.priceCents)}
                    {product.costCents ? <span className="block text-xs font-normal" style={{ color: "var(--a-mute)" }}>marge {marge(product.priceCents, product.costCents)}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className="a-button text-xs" onClick={() => setVariantsOpen(variantsOpen === product.id ? null : product.id)}>Varianten</button>
                      <button type="button" className="a-button text-xs" onClick={() => edit(product)}>Bewerken</button>
                      {product.active && <button type="button" className="a-button text-xs" onClick={() => archive(product.id)}>Verbergen</button>}
                    </div>
                  </td>
                </tr>
                {variantsOpen === product.id && (
                  <tr style={{ borderColor: "var(--a-border)" }} className="border-b">
                    <td colSpan={6} className="px-4 py-4" style={{ background: "var(--a-panel-2)" }}>
                      {product.variants.length === 0 ? (
                        <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen varianten — dit product toont één keuze (eigen voorraad = productvoorraad).</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead><tr style={{ color: "var(--a-mute)" }}><th className="pb-2 text-left">Maat</th><th className="pb-2 text-left">Kleur</th><th className="pb-2 text-left">Prijs</th><th className="pb-2 text-left">Voorraad</th><th className="pb-2 text-left">SKU</th><th /></tr></thead>
                          <tbody>
                            {product.variants.map((v) => (
                              <tr key={v.id} style={{ color: "var(--a-text)" }}>
                                <td className="py-1 pr-3">{v.size ?? "—"}</td>
                                <td className="py-1 pr-3">{v.color ?? "—"}</td>
                                <td className="py-1 pr-3">{v.priceCents != null ? money(v.priceCents / 100) : "erft van product"}</td>
                                <td className="py-1 pr-3">{v.stock}</td>
                                <td className="py-1 pr-3 font-mono text-xs" style={{ color: "var(--a-mute)" }}>{v.sku}</td>
                                <td className="py-1"><button type="button" className="a-button text-xs" onClick={() => removeVariant(product.id, v.id)}>Verwijderen</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void addVariant(product.id); }}>
                        <label className="text-xs" style={{ color: "var(--a-mute)" }}>Maat<input className="a-input w-20" value={variantForm.size} onChange={(e) => setVariantForm((f) => ({ ...f, size: e.target.value }))} placeholder="M" /></label>
                        <label className="text-xs" style={{ color: "var(--a-mute)" }}>Kleur<input className="a-input w-28" value={variantForm.color} onChange={(e) => setVariantForm((f) => ({ ...f, color: e.target.value }))} placeholder="Zwart" /></label>
                        <label className="text-xs" style={{ color: "var(--a-mute)" }}>Prijs (centen)<input className="a-input w-28" value={variantForm.priceCents} onChange={(e) => setVariantForm((f) => ({ ...f, priceCents: e.target.value }))} placeholder="optioneel" /></label>
                        <label className="text-xs" style={{ color: "var(--a-mute)" }}>Voorraad<input className="a-input w-20" type="number" min="0" value={variantForm.stock} onChange={(e) => setVariantForm((f) => ({ ...f, stock: e.target.value }))} /></label>
                        <button type="submit" className="a-button a-button-primary text-xs">Variant toevoegen</button>
                      </form>
                      {variantMessage && <p className="mt-2 text-xs" style={{ color: "var(--a-dim)" }}>{variantMessage}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    )}

    {tab === "orders" && (
    <section className="a-panel overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--a-border)" }}>
        <input value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} placeholder="Zoek op naam, e-mail of order-id…" className="a-input max-w-xs flex-1" />
        <select className="a-input w-auto" value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value as OrderStatus | "")}>
          <option value="">Alle statussen</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {orderMessage && <p className="w-full text-sm" style={{ color: "var(--a-dim)" }}>{orderMessage}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide" style={{ borderColor: "var(--a-border)", color: "var(--a-mute)" }}>
              <th className="px-4 py-2.5 font-semibold">Klant</th>
              <th className="px-4 py-2.5 font-semibold">Datum</th>
              <th className="px-4 py-2.5 font-semibold">Producten</th>
              <th className="px-4 py-2.5 text-right font-semibold">Totaal</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shownOrders.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm" style={{ color: "var(--a-mute)" }}>{orders.length === 0 ? "Nog geen bestellingen binnengekomen." : "Niets gevonden."}</td></tr>
            )}
            {shownOrders.map((order) => (
              <Fragment key={order.id}>
                <tr className="border-b" style={{ borderColor: "var(--a-border)" }}>
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: "var(--a-text)" }}>{order.firstName} {order.lastName}</p>
                    <p className="text-xs" style={{ color: "var(--a-mute)" }}>{order.email}</p>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--a-dim)" }}>{new Date(order.createdAt).toLocaleDateString("nl-NL")}</td>
                  <td className="max-w-[18rem] truncate px-4 py-3" style={{ color: "var(--a-dim)" }}>{order.itemsJson.map((l) => `${l.qty}x ${l.name}`).join(", ")}</td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: "var(--a-text)" }}>{money(order.totalCents / 100)}</td>
                  <td className="px-4 py-3"><OrderPill status={order.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="a-button text-xs" onClick={() => setOpenOrder(openOrder === order.id ? null : order.id)}>{openOrder === order.id ? "Sluiten" : "Beheren"}</button>
                  </td>
                </tr>
                {openOrder === order.id && (
                  <tr className="border-b" style={{ borderColor: "var(--a-border)" }}>
                    <td colSpan={6} className="px-4 py-4" style={{ background: "var(--a-panel-2)" }}>
                      <p className="text-sm" style={{ color: "var(--a-dim)" }}>{order.address}, {order.postalCode} {order.city}</p>
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="text-xs" style={{ color: "var(--a-mute)" }}>Status
                          <select className="a-input mt-1 w-auto" value={order.status} onChange={(e) => setOrderStatus(order.id, e.target.value as OrderStatus)}>
                            {Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void setOrderTracking(order.id, String(fd.get("carrier") ?? ""), String(fd.get("trackingNumber") ?? "")); }}>
                          <label className="text-xs" style={{ color: "var(--a-mute)" }}>Vervoerder<input name="carrier" defaultValue={order.carrier ?? ""} placeholder="postnl / dhl" className="a-input mt-1 w-24" /></label>
                          <label className="text-xs" style={{ color: "var(--a-mute)" }}>Track & trace<input name="trackingNumber" defaultValue={order.trackingNumber ?? ""} placeholder="code" className="a-input mt-1 w-32" /></label>
                          <button type="submit" className="a-button text-xs">Opslaan</button>
                        </form>
                        <a className="a-button text-xs" href={`/api/admin/shop/orders/${order.id}/packing-slip`} target="_blank" rel="noreferrer">Pakbon</a>
                        {["RECEIVED", "CONFIRMED", "SHIPPED"].includes(order.status) && (
                          <button
                            type="button"
                            className="a-button text-xs"
                            onClick={async () => {
                              if (!window.confirm(`Bestelling van ${order.firstName} ${order.lastName} volledig terugbetalen via Stripe? De bestelling wordt geannuleerd en de voorraad teruggeboekt.`)) return;
                              const r = await fetch(`/api/admin/shop/orders/${order.id}/refund`, { method: "POST" });
                              const d = await r.json().catch(() => ({}));
                              setOrderMessage(r.ok ? `Terugbetaald: ${money(d.amountCents / 100)}.` : d?.error?.message ?? "Terugbetalen mislukt.");
                              void loadOrders();
                            }}
                          >
                            Terugbetalen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    )}
  </div>;
}

type ShopStats = {
  revenueCents: number;
  revenue30dCents: number;
  paidOrderCount: number;
  pendingOrderCount: number;
  totalOrderCount: number;
  topProducts: { name: string; qty: number; revenueCents: number }[];
  lowStock: { variantId: string; productName: string; slug: string; size: string | null; color: string | null; stock: number }[];
};

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={active ? { background: "rgba(22,163,74,0.14)", color: "#15803d" } : { background: "var(--a-panel-2)", color: "var(--a-mute)" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "#16a34a" : "var(--a-mute)" }} />
      {active ? "Live" : "Verborgen"}
    </span>
  );
}

function OrderPill({ status }: { status: OrderStatus }) {
  const tone = ORDER_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: tone.bg, color: tone.fg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

function ImageUpload({ label, value, busy, onUpload }: { label: string; value: string | null | undefined; busy: boolean; onUpload: (file: File) => void }) {
  return <label className="a-label">{label}<div className="mt-2 overflow-hidden rounded-xl border border-dashed p-3" style={{ borderColor: "var(--a-border-strong)" }}>{value ? <img src={value} alt="Voorbeeld" className="mb-3 h-36 w-full rounded-lg object-cover" /> : <div className="mb-3 grid h-36 place-items-center rounded-lg" style={{ background: "var(--a-panel-2)", color: "var(--a-mute)" }}>Nog geen foto</div>}<span className="a-button inline-flex">{busy ? "Uploaden…" : "Kies foto"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file); }} /></span></div></label>;
}
