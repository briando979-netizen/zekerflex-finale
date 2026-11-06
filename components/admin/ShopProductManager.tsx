"use client";

import { useState } from "react";
import { Product, PRODUCT_CATEGORIES, formatPrice } from "@/lib/shop/products";

export function ShopProductManager() {
  const [products, setProducts] = useState<Product[]>([
    {
      id: "prod_1",
      name: "Flexwerk Starter Kit",
      description: "Alles wat je nodig hebt om te starten",
      priceCents: 4999,
      category: "tools",
      sku: "FK-001",
      active: true,
      featured: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({});

  const handleAddProduct = async () => {
    if (!formData.name || !formData.priceCents) return;
    const newProduct: Product = {
      id: `prod_${Date.now()}`,
      name: formData.name,
      description: formData.description || "",
      priceCents: formData.priceCents,
      category: formData.category || "tools",
      sku: formData.sku || "",
      active: true,
      featured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setProducts([...products, newProduct]);
    setFormData({});
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold" style={{ color: "var(--a-text)" }}>
          Winkelproducten
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ backgroundColor: "var(--a-ok)", color: "white" }}
        >
          + Product toevoegen
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <h3 className="mb-4 font-semibold" style={{ color: "var(--a-text)" }}>
            Nieuw product
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm" style={{ color: "var(--a-mute)" }}>
                Naam
              </label>
              <input
                type="text"
                placeholder="Productnaam"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 w-full rounded border p-2"
                style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
              />
            </div>
            <div>
              <label className="text-sm" style={{ color: "var(--a-mute)" }}>
                Beschrijving
              </label>
              <textarea
                placeholder="Beschrijving"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 w-full rounded border p-2"
                style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm" style={{ color: "var(--a-mute)" }}>
                  Prijs (€)
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={(formData.priceCents || 0) / 100}
                  onChange={(e) =>
                    setFormData({ ...formData, priceCents: Math.round(parseFloat(e.target.value) * 100) })
                  }
                  className="mt-1 w-full rounded border p-2"
                  style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
                />
              </div>
              <div>
                <label className="text-sm" style={{ color: "var(--a-mute)" }}>
                  Categorie
                </label>
                <select
                  value={formData.category || "tools"}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="mt-1 w-full rounded border p-2"
                  style={{ borderColor: "var(--a-border)", backgroundColor: "var(--a-bg)" }}
                >
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddProduct}
                className="flex-1 rounded-lg px-4 py-2 font-medium text-white"
                style={{ backgroundColor: "var(--a-ok)" }}
              >
                Opslaan
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-lg px-4 py-2 font-medium"
                style={{ backgroundColor: "var(--a-bg)", color: "var(--a-mute)" }}
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Products table */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--a-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--a-bg)", borderBottom: "1px solid var(--a-border)" }}>
              <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Product
              </th>
              <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Categorie
              </th>
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                Prijs
              </th>
              <th className="px-4 py-3 text-center font-semibold" style={{ color: "var(--a-text)" }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                <td className="px-4 py-3">
                  <div>
                    <p style={{ color: "var(--a-text)" }} className="font-medium">
                      {product.name}
                    </p>
                    <p style={{ color: "var(--a-mute)" }} className="text-xs">
                      {product.description}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--a-mute)" }}>
                  {PRODUCT_CATEGORIES.find((c) => c.id === product.category)?.name}
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                  {formatPrice(product.priceCents)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className="inline-block rounded px-2 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: product.active ? "rgba(0, 200, 0, 0.1)" : "rgba(200, 0, 0, 0.1)",
                      color: product.active ? "var(--a-ok)" : "var(--a-crit)",
                    }}
                  >
                    {product.active ? "Actief" : "Inactief"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Totaal producten
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {products.length}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Uitgelicht
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {products.filter((p) => p.featured).length}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Totale voorraad (€)
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {formatPrice(products.reduce((sum, p) => sum + p.priceCents, 0))}
          </p>
        </div>
      </div>
    </div>
  );
}
