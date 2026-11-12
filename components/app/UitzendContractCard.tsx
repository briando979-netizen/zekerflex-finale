"use client";

import { useCallback, useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";

interface Contract {
  id: string;
  reference: string;
  signedAt: string;
  validFrom: string;
  validUntil: string;
  phase: "A" | "B" | "C";
  weeksWorked: number;
}

export function UitzendContractCard() {
  const ft = useFT();
  const t = ft.uitzendContract;
  const fmt = (s: string) => new Date(s).toLocaleDateString(ft.intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  const [active, setActive] = useState<Contract | null | undefined>(undefined);
  const [history, setHistory] = useState<Contract[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/me/uitzend/contract", { cache: "no-store" });
      const d = await r.json();
      setActive(d.active ?? null);
      setHistory(Array.isArray(d.history) ? d.history : []);
    } catch {
      setActive(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sign() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/me/uitzend/contract", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? t.mislukt);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (active === undefined) return <p className="text-xs text-neutralx-400">{t.laden}</p>;

  if (!active) {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-brand-50/40 p-4">
        <p className="text-sm font-semibold text-ink">{t.teken}</p>
        <p className="mt-1 text-xs leading-relaxed text-neutralx-600">
          {t.uitleg}
        </p>
        {err && <p role="alert" className="mt-2 text-xs text-crit">{err}</p>}
        <button
          type="button"
          onClick={sign}
          disabled={busy}
          className="btn-primary mt-3 px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? t.bezig : t.ondertekenen}
        </button>
      </div>
    );
  }

  const expired = new Date(active.validUntil).getTime() < Date.now();

  return (
    <div className="rounded-xl border border-hair p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{t.getekend}</p>
          <p className="mt-0.5 text-xs text-neutralx-500">
            {vulIn(t.ref, { ref: active.reference, datum: fmt(active.signedAt) })}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            expired ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok"
          }`}
        >
          {expired ? t.verlopen : t.actief}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-neutralx-500">{t.geldigVan}</dt>
        <dd className="text-ink">{fmt(active.validFrom)}</dd>
        <dt className="text-neutralx-500">{t.geldigTot}</dt>
        <dd className="text-ink">{fmt(active.validUntil)}</dd>
        <dt className="text-neutralx-500">{t.abuFase}</dt>
        <dd className="text-ink">
          {vulIn(t.fase, { fase: active.phase, weken: active.weeksWorked })}
        </dd>
      </dl>
      <a
        href="/api/me/uitzend/contract/pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-xs font-semibold text-brand-600 underline"
      >
        {t.bekijk}
      </a>

      {expired && (
        <div className="mt-3 border-t border-hair pt-3">
          <p className="text-xs text-neutralx-600">
            {t.verlopenTekst}
          </p>
          {err && <p role="alert" className="mt-1 text-xs text-crit">{err}</p>}
          <button
            type="button"
            onClick={sign}
            disabled={busy}
            className="btn-primary mt-2 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {busy ? t.bezig : t.nieuw}
          </button>
        </div>
      )}

      {history.length > 1 && (
        <div className="mt-3 border-t border-hair pt-3">
          <p className="text-xs font-semibold text-neutralx-500">{t.eerdere}</p>
          <ul className="mt-1 space-y-1">
            {history
              .filter((h) => h.id !== active.id)
              .map((h) => (
                <li key={h.id} className="flex items-center justify-between text-xs text-neutralx-500">
                  <span>
                    {h.reference} · {fmt(h.validFrom)} – {fmt(h.validUntil)}
                  </span>
                  <a
                    href={`/api/me/uitzend/contract/pdf?id=${h.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-600 underline"
                  >
                    {t.pdf}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
