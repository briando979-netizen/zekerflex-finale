"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFT } from "@/components/i18n/useFT";

interface Cert {
  id: string;
  type: string;
  customLabel?: string;
  number?: string;
  issuedOn?: string;
  expiresOn?: string;
  uploadId?: string;
  fileName?: string;
  status: "pending" | "valid" | "expired" | "rejected";
  statusNote?: string;
  addedAt: string;
}

// Volgorde van de keuzelijst; de namen staan in de app-taal (useFT().cert.types).
const TYPE_KEYS = ["VCA_BASIS", "VCA_VOL", "BHV", "EHBO", "HEFTRUCK", "REACHTRUCK", "RIJBEWIJS_B", "RIJBEWIJS_C", "RIJBEWIJS_D", "SVH", "OVERIG"] as const;

const STATUS_CLS: Record<Cert["status"], string> = {
  valid: "bg-ok/10 text-ok",
  pending: "bg-warn/10 text-warn",
  expired: "bg-crit/10 text-crit",
  rejected: "bg-crit/10 text-crit",
};

function expiresSoon(s?: string) {
  if (!s) return false;
  const d = new Date(s).getTime() - Date.now();
  return d > 0 && d < 60 * 86_400_000;
}

export function CertificatesManager() {
  const ft = useFT();
  const t = ft.cert;
  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString(ft.intl, { timeZone: "Europe/Amsterdam" }) : "—");
  const typeLabel = (type: string) => (t.types as Record<string, string>)[type] ?? type;
  const [certs, setCerts] = useState<Cert[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/me/certificates", { cache: "no-store" });
      const d = await r.json();
      setCerts(Array.isArray(d.certificates) ? d.certificates : []);
    } catch {
      setCerts([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    await fetch(`/api/me/certificates/${id}`, { method: "DELETE" });
    void load();
  }

  const hasValidVca = certs?.some((c) => (c.type === "VCA_BASIS" || c.type === "VCA_VOL") && c.status === "valid");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">{t.mine}</h2>
        {certs === null ? (
          <p className="mt-3 text-sm text-neutralx-400">{t.loading}</p>
        ) : certs.length === 0 ? (
          <p className="mt-3 rounded-xl border border-hair bg-white p-6 text-sm text-neutralx-500">{t.empty}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {certs.map((c) => (
              <li key={c.id} className="rounded-2xl border border-hair bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold text-ink">
                      {c.type === "OVERIG" && c.customLabel ? c.customLabel : typeLabel(c.type)}
                    </p>
                    <p className="mt-0.5 text-xs text-neutralx-500">
                      {[c.number ? t.number(c.number) : null, c.issuedOn ? t.issued(fmt(c.issuedOn)) : null, c.expiresOn ? t.validUntil(fmt(c.expiresOn)) : t.noExpiry]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[c.status]}`}>{t.status[c.status]}</span>
                </div>
                {c.statusNote && <p className="mt-2 text-xs text-neutralx-500">{c.statusNote}</p>}
                {expiresSoon(c.expiresOn) && c.status === "valid" && <p className="mt-1.5 text-xs font-medium text-warn">{t.expiresSoon}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {c.uploadId && (
                    <a href={`/api/me/certificates/${c.id}/file`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline">
                      {t.viewUpload}
                    </a>
                  )}
                  <button type="button" onClick={() => remove(c.id)} className="font-medium text-neutralx-400 hover:text-crit">
                    {t.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {certs !== null && !hasValidVca && (
          <div className="mt-4 rounded-xl border border-hair bg-paper-soft p-4 text-sm">
            <p className="font-semibold text-ink">{t.noVcaTitle}</p>
            <p className="mt-1 text-xs text-neutralx-600">
              {t.noVcaBefore}{" "}
              <Link href="/shop#vca-basis-boek" className="font-semibold text-brand-600 underline">
                {t.noVcaLink}
              </Link>{" "}
              {t.noVcaAfter}
            </p>
          </div>
        )}
      </div>

      <AddForm onAdded={load} />
    </div>
  );
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const t = useFT().cert;
  const [type, setType] = useState("VCA_BASIS");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/me/certificates", { method: "POST", body: new FormData(e.currentTarget) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? t.addFailed);
      setMsg({ t: "ok", s: d.certificate.status === "valid" ? t.addedValid : t.addedPending });
      formRef.current?.reset();
      setFileName(null);
      onAdded();
    } catch (err) {
      setMsg({ t: "err", s: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="h-fit rounded-2xl border border-hair bg-white p-5 shadow-card">
      <h2 className="font-display text-lg font-bold text-ink">{t.addTitle}</h2>
      <label className="field-label mt-4 block">
        {t.type}
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="field-input">
          {TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {t.types[k]}
            </option>
          ))}
        </select>
      </label>
      {type === "OVERIG" && (
        <label className="field-label mt-3 block">
          {t.customName}
          <input name="customLabel" required className="field-input" placeholder={t.customPlaceholder} />
        </label>
      )}
      <label className="field-label mt-3 block">
        {t.certNumber} <span className="font-normal text-neutralx-400">{t.optional}</span>
        <input name="number" className="field-input" />
      </label>
      {/* Two date fields side by side are wider than a phone (date inputs have an intrinsic width): stack them below 640px. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="field-label min-w-0">
          {t.issuedOn}
          <input type="date" name="issuedOn" className="field-input min-w-0" />
        </label>
        <label className="field-label min-w-0">
          {t.expiresOn}
          <input type="date" name="expiresOn" className="field-input min-w-0" />
        </label>
      </div>
      <label className="field-label mt-3 block">
        {t.file}
        <div className="mt-1.5 rounded-lg border border-dashed border-hairstrong px-3 py-4">
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="text-sm text-neutralx-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          />
          <p className="mt-1 text-xs text-neutralx-400">{fileName ? t.chosen(fileName) : t.fileHint}</p>
        </div>
      </label>
      {msg && <p role="status" className={`mt-3 text-sm ${msg.t === "ok" ? "text-ok" : "text-crit"}`}>{msg.s}</p>}
      <button type="submit" disabled={busy} className="btn-primary mt-4 w-full disabled:opacity-50">
        {busy ? t.adding : t.add}
      </button>
    </form>
  );
}
