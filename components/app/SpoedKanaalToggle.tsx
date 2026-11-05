"use client";

import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";

// Account van de kracht: sms/WhatsApp bij spoedoproepen aan of uit
// (lib/spoed; STOP per bericht zet hem ook uit). Push in de app staat los.
export function SpoedKanaalToggle() {
  const t = useFT().spoed;
  const [aan, setAan] = useState<boolean | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(false);

  useEffect(() => {
    fetch("/api/me/spoed", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { uit?: boolean } | null) => setAan(d ? !d.uit : true))
      .catch(() => setAan(true));
  }, []);

  async function wissel() {
    if (aan === null) return;
    setBezig(true);
    setFout(false);
    try {
      const r = await fetch("/api/me/spoed", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uit: aan }) });
      if (!r.ok) throw new Error();
      setAan(!aan);
    } catch {
      setFout(true);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-hair bg-white p-4 shadow-card">
      <div className="min-w-0">
        <p className="font-semibold text-ink">⚡ {t.title}</p>
        <p className="mt-0.5 text-xs text-neutralx-500">{t.body}</p>
        {fout && (
          <p role="alert" className="mt-1 text-xs text-crit">
            {t.failed}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={aan === true}
        disabled={bezig || aan === null}
        onClick={() => void wissel()}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${aan ? "bg-ok/10 text-ok" : "bg-paper-soft text-neutralx-600"}`}
      >
        {bezig ? t.saving : aan ? t.on : t.off}
      </button>
    </div>
  );
}
