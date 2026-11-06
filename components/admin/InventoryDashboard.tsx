"use client";

import { InventoryItem, getStockStatus } from "@/lib/shop/inventory";

interface InventoryDashboardProps {
  items?: InventoryItem[];
}

export function InventoryDashboard({ items = [] }: InventoryDashboardProps) {
  const mockItems: InventoryItem[] = [
    {
      id: "inv_1",
      productId: "prod_1",
      sku: "FK-001",
      quantity: 150,
      reservedQuantity: 23,
      lastRestocked: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      reorderLevel: 20,
      supplier: "Leverancier A",
    },
    {
      id: "inv_2",
      productId: "prod_2",
      sku: "PS-001",
      quantity: 8,
      reservedQuantity: 5,
      lastRestocked: new Date(),
      reorderLevel: 15,
      supplier: "Leverancier B",
    },
  ];

  const displayItems = items.length > 0 ? items : mockItems;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--a-text)" }}>
          Voorraadbeheer
        </h2>
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Stock monitoring en herbestellingen
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Totale voorraad
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {displayItems.reduce((sum, i) => sum + i.quantity, 0)}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Gereserveerd
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {displayItems.reduce((sum, i) => sum + i.reservedQuantity, 0)}
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-crit)" }}>
            Laag in voorraad
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-crit)" }}>
            {displayItems.filter((i) => i.quantity < i.reorderLevel).length}
          </p>
        </div>
      </div>

      {/* Inventory table */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--a-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--a-bg)", borderBottom: "1px solid var(--a-border)" }}>
              <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Product
              </th>
              <th className="px-4 py-3 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                SKU
              </th>
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                Voorraad
              </th>
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                Gereserveerd
              </th>
              <th className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                Beschikbaar
              </th>
              <th className="px-4 py-3 text-center font-semibold" style={{ color: "var(--a-text)" }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item) => {
              const available = item.quantity - item.reservedQuantity;
              const status = getStockStatus(available, item.reservedQuantity);
              return (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--a-text)" }}>
                    {item.productId}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--a-mute)" }}>
                    {item.sku}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--a-text)" }}>
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--a-mute)" }}>
                    {item.reservedQuantity}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                    {available}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-block rounded px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor:
                          status === "in_stock"
                            ? "rgba(0, 200, 0, 0.1)"
                            : status === "low_stock"
                              ? "rgba(200, 150, 0, 0.1)"
                              : "rgba(200, 0, 0, 0.1)",
                        color:
                          status === "in_stock"
                            ? "var(--a-ok)"
                            : status === "low_stock"
                              ? "var(--a-warn)"
                              : "var(--a-crit)",
                      }}
                    >
                      {status === "in_stock" ? "In voorraad" : status === "low_stock" ? "Laag" : "Uitverkocht"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
