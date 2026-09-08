"use client";

import { useState, useTransition } from "react";

export function PayInvoiceButton({
  invoiceId,
  label,
  pendingLabel,
}: {
  invoiceId: string;
  label: string;
  pendingLabel: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const res = await fetch(`/api/invoices/${invoiceId}/checkout`, { method: "POST" });
              const data = await res.json();
              if (!res.ok || !data.url) {
                throw new Error(data?.error?.message ?? "Betalen mislukt");
              }
              window.location.href = data.url;
            } catch (err) {
              setError(err instanceof Error ? err.message : "Betalen mislukt");
            }
          })
        }
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {pending ? pendingLabel : label}
      </button>
      {error && <span className="max-w-[180px] text-right text-[11px] text-crit">{error}</span>}
    </div>
  );
}
