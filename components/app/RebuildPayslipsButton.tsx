"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RebuildPayslipsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/me/payroll/rebuild", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Herberekenen mislukt");
      setMsg(
        Array.isArray(d.weeks) && d.weeks.length
          ? `${d.weeks.length} ${d.weeks.length === 1 ? "week" : "weken"} bijgewerkt`
          : "Geen nieuwe weken om te berekenen",
      );
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-xs text-neutralx-400">{msg}</span>}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
      >
        {busy ? "Berekenen…" : "Loonstroken herberekenen"}
      </button>
    </span>
  );
}
