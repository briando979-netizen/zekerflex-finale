"use client";

import { useEffect, useState } from "react";

interface Row {
  userId: string;
  name: string;
  email: string | null;
  workerKind: "zzp" | "flexwerker" | "uitzendkracht" | null;
  vatNumber: string | null;
  hasVat: boolean;
  vatValid: boolean;
  invoiceMode: string;
  complete: boolean;
  updatedAt: string;
}
interface Payload {
  rows: Row[];
  counts: { total: number; complete: number; zzp: number; flexwerker: number; uitzendkracht: number; vatInvalid: number };
}

const KIND: Record<string, string> = { zzp: "ZZP'er", flexwerker: "Flexwerker", uitzendkracht: "Uitzendkracht" };
const MODE: Record<string, string> = {
  "reverse-billing": "Reverse billing",
  "self-invoice": "Zelf-facturatie (KOR)",
  payroll: "Payroll / verloning",
};

export function FiscalBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/fiscaal", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => undefined);
  }, []);

  async function reveal(userId: string) {
    setRevealing(userId);
    try {
      const res = await fetch("/api/admin/fiscaal/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const d = await res.json();
        setRevealed((r) => ({ ...r, [userId]: d.vatNumber || "—" }));
      }
    } finally {
      setRevealing(null);
    }
  }

  const rows = (data?.rows ?? []).filter((r) => !filter || r.workerKind === filter);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Werkvormen & fiscale gegevens</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Btw-nummers en verloningsvorm per flexwerker — voor correcte facturatie en verloning. Alleen zichtbaar
          voor platformbeheerders; btw-nummers zijn gemaskeerd totdat je op &ldquo;Open&rdquo; klikt (dit wordt
          vastgelegd in het auditspoor).
        </p>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ["Totaal", data.counts.total, ""],
            ["Compleet", data.counts.complete, "ok"],
            ["ZZP'ers", data.counts.zzp, "zzp"],
            ["Flexwerkers", data.counts.flexwerker, "flexwerker"],
            ["Uitzendkr.", data.counts.uitzendkracht, "uitzendkracht"],
            ["Btw ongeldig", data.counts.vatInvalid, "warn"],
          ].map(([l, n, key]) => (
            <button
              key={l as string}
              type="button"
              onClick={() => setFilter(["zzp", "flexwerker", "uitzendkracht"].includes(key as string) ? (filter === key ? "" : (key as string)) : "")}
              className={`card p-3 text-left ${filter === key ? "ring-2 ring-brand-500" : ""}`}
            >
              <p className="text-xs text-neutralx-500">{l}</p>
              <p className={`num mt-1 text-xl font-bold ${key === "warn" && (n as number) > 0 ? "text-crit" : key === "ok" ? "text-ok" : "text-ink"}`}>{n}</p>
            </button>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        {!data ? (
          <div className="space-y-px">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse bg-paper-soft" />)}</div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen fiscale profielen ingevuld.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Naam</th>
                  <th className="px-5 py-2.5 font-medium">Werkvorm</th>
                  <th className="px-5 py-2.5 font-medium">Btw-nummer</th>
                  <th className="px-5 py-2.5 font-medium">Facturatie</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{r.name}</p>
                      {r.email && <p className="text-xs text-neutralx-400">{r.email}</p>}
                    </td>
                    <td className="px-5 py-3 text-neutralx-600">{r.workerKind ? KIND[r.workerKind] : "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">
                      {!r.hasVat ? (
                        "—"
                      ) : revealed[r.userId] ? (
                        <>
                          {revealed[r.userId]}{" "}
                          <span className={r.vatValid ? "text-ok" : "text-warn"}>{r.vatValid ? "✓" : "!"}</span>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reveal(r.userId)}
                          disabled={revealing === r.userId}
                          className="rounded-full border border-hairstrong px-2 py-0.5 font-sans text-[11px] font-medium text-brand-600 hover:bg-paper-soft disabled:opacity-50"
                        >
                          {revealing === r.userId ? "Bezig…" : "•••••• Open"}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3 text-neutralx-600">{MODE[r.invoiceMode] ?? r.invoiceMode}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={r.complete ? "pill-ok" : "pill-warn"}>{r.complete ? "Compleet" : "Onvolledig"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
