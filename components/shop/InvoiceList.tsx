"use client";

import { Invoice } from "@/lib/shop/invoices";

interface InvoiceListProps {
  invoices: Invoice[];
  onDownload?: (invoice: Invoice) => void;
}

export function InvoiceList({ invoices, onDownload }: InvoiceListProps) {
  const getStatusColor = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":
        return { bg: "rgba(0, 200, 0, 0.1)", text: "var(--a-ok)" };
      case "sent":
        return { bg: "rgba(0, 150, 200, 0.1)", text: "var(--a-info)" };
      case "overdue":
        return { bg: "rgba(200, 0, 0, 0.1)", text: "var(--a-crit)" };
      default:
        return { bg: "rgba(100, 100, 100, 0.1)", text: "var(--a-mute)" };
    }
  };

  const statusLabels: Record<string, string> = {
    draft: "Concept",
    sent: "Verstuurd",
    paid: "Betaald",
    overdue: "Vervallen",
    cancelled: "Geannuleerd",
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
        Facturen
      </h3>

      {invoices.length === 0 ? (
        <p style={{ color: "var(--a-mute)" }}>Nog geen facturen</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--a-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--a-bg)", borderBottom: "1px solid var(--a-border)" }}>
                <th className="px-4 py-2 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                  Factuurnummer
                </th>
                <th className="px-4 py-2 text-left font-semibold" style={{ color: "var(--a-text)" }}>
                  Datum
                </th>
                <th className="px-4 py-2 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                  Bedrag
                </th>
                <th className="px-4 py-2 text-center font-semibold" style={{ color: "var(--a-text)" }}>
                  Status
                </th>
                <th className="px-4 py-2 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                  Actie
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const statusColor = getStatusColor(invoice.status);
                return (
                  <tr key={invoice.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--a-text)" }}>
                      {invoice.number}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--a-mute)" }}>
                      {invoice.date.toLocaleDateString("nl-NL")}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--a-text)" }}>
                      €{(invoice.totalCents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-block rounded px-2 py-1 text-xs font-medium"
                        style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                      >
                        {statusLabels[invoice.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onDownload?.(invoice)}
                        className="text-sm font-medium"
                        style={{ color: "var(--a-info)" }}
                      >
                        ⬇️ Download
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
