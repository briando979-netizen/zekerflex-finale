"use client";

import type { Order } from "@/lib/shop/subscription-manager";

interface Props {
  orders: Order[];
}

export function CustomerOrders({ orders }: Props) {
  if (!orders.length) {
    return (
      <div className="rounded-lg border p-4 text-center" style={{ borderColor: "var(--a-border)" }}>
        <p style={{ color: "var(--a-mute)" }}>Geen bestellingen gevonden</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
        Bestellingen
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--a-border)" }}>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Datum
              </th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Type
              </th>
              <th className="px-2 py-2 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                Bedrag
              </th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                Status
              </th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                <td className="px-2 py-3" style={{ color: "var(--a-text)" }}>
                  {order.createdAt.toLocaleDateString("nl-NL")}
                </td>
                <td className="px-2 py-3" style={{ color: "var(--a-mute)" }}>
                  {order.purchaseMode === "subscription" ? "Abonnement" : "Eenmalig"}
                </td>
                <td className="px-2 py-3 text-right font-semibold">
                  € {(order.totalCents / 100).toFixed(2)}
                </td>
                <td className="px-2 py-3">
                  <span
                    className="rounded px-2 py-1 text-xs font-semibold"
                    style={{
                      background:
                        order.status === "paid"
                          ? "rgba(34, 197, 94, 0.1)"
                          : "rgba(234, 179, 8, 0.1)",
                      color:
                        order.status === "paid"
                          ? "var(--a-ok)"
                          : "var(--a-warn)",
                    }}
                  >
                    {order.status === "paid"
                      ? "Betaald"
                      : order.status === "pending"
                        ? "Wacht..."
                        : "Verzonden"}
                  </span>
                </td>
                <td className="px-2 py-3 text-right">
                  {order.invoiceUrl && (
                    <a
                      href={order.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline"
                      style={{ color: "var(--a-link)" }}
                    >
                      Factuur
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
