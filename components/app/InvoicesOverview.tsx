"use client";

import { copyText } from "@/lib/clipboard";

import { useMemo, useState } from "react";
import { PayInvoiceButton } from "@/components/app/PayInvoiceButton";
import { QrCode } from "@/components/billing/QrCode";
import { Portal } from "@/components/chat/Portal";

export type InvoiceRow = {
  id: string;
  number: string;
  typeLabel: string;
  reverseCharge: boolean;
  branch: string;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  status: "ISSUED" | "PAID" | string;
  /** signed public pay link (open invoices only) — encoded in the QR */
  payUrl?: string;
};

type Dict = {
  allPanel: string;
  emptyTitle: string;
  emptyBody: string;
  outstandingPanel: string;
  outstandingBanner: string;
  noOutstanding: string;
  selectAll: string;
  selected: string;
  payDirect: string;
  payDirectCta: string;
  payDirectNone: string;
  colNr: string;
  colType: string;
  colBranch: string;
  colSubtotal: string;
  colVat: string;
  colTotal: string;
  colStatus: string;
  colPdf: string;
  colAction: string;
  reverseCharge: string;
  statusPaid: string;
  statusOpen: string;
  payNow: string;
  payPending: string;
  qrButton: string;
  qrTitle: string;
  qrBody: string;
  qrCopy: string;
  qrCopied: string;
  qrOpen: string;
  qrClose: string;
};

const moneyExact = (cents: number) => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function InvoicesOverview({ invoices, t }: { invoices: InvoiceRow[]; t: Dict }) {
  const outstanding = useMemo(() => invoices.filter((i) => i.status === "ISSUED"), [invoices]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<InvoiceRow | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyLink(url: string) {
    try {
      await copyText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  }

  const selectedInvoices = outstanding.filter((i) => selected.has(i.id));
  const selSubtotal = selectedInvoices.reduce((s, i) => s + i.subtotalCents, 0);
  const selVat = selectedInvoices.reduce((s, i) => s + i.vatCents, 0);
  const selTotal = selectedInvoices.reduce((s, i) => s + i.totalCents, 0);
  const allSelected = outstanding.length > 0 && selected.size === outstanding.length;

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(outstanding.map((i) => i.id)));

  async function payDirect() {
    if (selected.size === 0) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch("/api/invoices/bulk-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data?.error?.message ?? "Betalen mislukt");
      window.location.href = data.url;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Betalen mislukt");
      setPaying(false);
    }
  }

  function Table({ rows, selectable }: { rows: InvoiceRow[]; selectable: boolean }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
              {selectable && (
                <th className="px-5 py-2.5 font-medium">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t.selectAll} />
                </th>
              )}
              <th className="px-5 py-2.5 font-medium">{t.colNr}</th>
              <th className="px-5 py-2.5 font-medium">{t.colType}</th>
              <th className="px-5 py-2.5 font-medium">{t.colBranch}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t.colSubtotal}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t.colVat}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t.colTotal}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t.colStatus}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t.colPdf}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t.colAction}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {rows.map((i) => (
              <tr key={i.id}>
                {selectable && (
                  <td className="px-5 py-3">
                    <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} aria-label={i.number} />
                  </td>
                )}
                <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{i.number}</td>
                <td className="px-5 py-3 text-neutralx-600">
                  {i.typeLabel}
                  {i.reverseCharge && <span className="ml-1 text-xs text-neutralx-400">{t.reverseCharge}</span>}
                </td>
                <td className="px-5 py-3 text-neutralx-600">{i.branch}</td>
                <td className="num px-5 py-3 text-right text-neutralx-600">{moneyExact(i.subtotalCents)}</td>
                <td className="num px-5 py-3 text-right text-neutralx-600">{moneyExact(i.vatCents)}</td>
                <td className="num px-5 py-3 text-right font-medium">{moneyExact(i.totalCents)}</td>
                <td className="px-5 py-3 text-right">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      i.status === "PAID" ? "bg-ok/10 text-ok" : i.status === "ISSUED" ? "bg-warn/10 text-warn" : "bg-paper-soft text-neutralx-500"
                    }`}
                  >
                    {i.status === "PAID" ? t.statusPaid : i.status === "ISSUED" ? t.statusOpen : i.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
                    PDF ↓
                  </a>
                </td>
                <td className="px-5 py-3 text-right">
                  {i.status === "ISSUED" && (
                    <span className="inline-flex items-center gap-2">
                      {i.payUrl && (
                        <button
                          type="button"
                          onClick={() => setQrFor(i)}
                          className="rounded-lg border border-hairstrong px-2 py-1 text-xs font-semibold text-ink hover:bg-paper-soft"
                          aria-label={`${t.qrTitle} — ${i.number}`}
                        >
                          {t.qrButton}
                        </button>
                      )}
                      <PayInvoiceButton invoiceId={i.id} label={t.payNow} pendingLabel={t.payPending} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {outstanding.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-ink">{t.outstandingBanner}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">{t.outstandingPanel}</div>
          {outstanding.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutralx-400">{t.noOutstanding}</p>
          ) : (
            <Table rows={outstanding} selectable />
          )}
        </div>

        {outstanding.length > 0 && (
          <div className="card sticky top-20 h-fit p-5">
            <p className="text-sm font-semibold">{t.payDirect}</p>
            <p className="mt-1 text-xs text-neutralx-500">{selected.size} {t.selected}</p>
            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-neutralx-600"><span>Subtotaal</span><span>{moneyExact(selSubtotal)}</span></div>
              <div className="flex justify-between text-neutralx-600"><span>Btw</span><span>{moneyExact(selVat)}</span></div>
              <div className="flex justify-between border-t border-hair pt-1.5 font-semibold"><span>Totaal</span><span>{moneyExact(selTotal)}</span></div>
            </div>
            <button
              type="button"
              onClick={payDirect}
              disabled={selected.size === 0 || paying}
              className="btn-primary mt-4 w-full text-sm disabled:opacity-50"
            >
              {paying ? t.payPending : t.payDirectCta}
            </button>
            {selected.size === 0 && <p className="mt-2 text-xs text-neutralx-400">{t.payDirectNone}</p>}
            {payError && <p className="mt-2 text-xs text-crit">{payError}</p>}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-hair px-5 py-3 text-sm font-semibold">{t.allPanel}</div>
        {invoices.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink">{t.emptyTitle}</p>
            <p className="mt-1 text-sm text-neutralx-500">{t.emptyBody}</p>
          </div>
        ) : (
          <Table rows={invoices} selectable={false} />
        )}
      </div>

      {qrFor?.payUrl && (
        <Portal>
          <div
            className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4"
            onClick={() => setQrFor(null)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t.qrTitle}
              className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-display text-lg font-bold text-ink">{t.qrTitle}</p>
              <p className="mt-1 text-sm text-neutralx-500">
                {qrFor.number} · <span className="num font-semibold text-ink">{moneyExact(qrFor.totalCents)}</span>
              </p>
              <div className="mt-4 flex justify-center">
                <QrCode value={qrFor.payUrl} size={208} label={`${t.qrTitle} — ${qrFor.number}`} />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-neutralx-500">{t.qrBody}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => copyLink(qrFor.payUrl!)} className="btn-ghost text-sm">
                  {copied ? t.qrCopied : t.qrCopy}
                </button>
                <a href={qrFor.payUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
                  {t.qrOpen}
                </a>
              </div>
              <button type="button" onClick={() => setQrFor(null)} className="mt-4 text-xs text-neutralx-400 hover:text-ink">
                {t.qrClose}
              </button>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
