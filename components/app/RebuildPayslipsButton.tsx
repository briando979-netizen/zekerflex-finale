"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";

export function RebuildPayslipsButton() {
  const router = useRouter();
  const t = useFT().loonstrook.rebuild;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/me/payroll/rebuild", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? t.mislukt);
      setMsg(
        Array.isArray(d.weeks) && d.weeks.length
          ? vulIn(d.weeks.length === 1 ? t.wekenEen : t.wekenMeer, { n: d.weeks.length })
          : t.geen,
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
        {busy ? t.bezig : t.knop}
      </button>
    </span>
  );
}
