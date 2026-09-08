"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

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

const TYPE_LABEL: Record<string, string> = {
  VCA_BASIS: "VCA Basisveiligheid (B-VCA)",
  VCA_VOL: "VCA VOL (leidinggevenden)",
  BHV: "BHV (bedrijfshulpverlening)",
  EHBO: "EHBO",
  HEFTRUCK: "Heftruckcertificaat",
  REACHTRUCK: "Reachtruckcertificaat",
  RIJBEWIJS_B: "Rijbewijs B (auto)",
  RIJBEWIJS_C: "Rijbewijs C (vrachtwagen)",
  RIJBEWIJS_D: "Rijbewijs D (bus)",
  SVH: "SVH Sociale Hygiëne (horeca)",
  OVERIG: "Ander certificaat",
};

const STATUS: Record<Cert["status"], { label: string; cls: string }> = {
  valid: { label: "Geldig", cls: "bg-ok/10 text-ok" },
  pending: { label: "In controle", cls: "bg-warn/10 text-warn" },
  expired: { label: "Verlopen", cls: "bg-crit/10 text-crit" },
  rejected: { label: "Afgekeurd", cls: "bg-crit/10 text-crit" },
};

const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString("nl-NL") : "—");
function expiresSoon(s?: string) {
  if (!s) return false;
  const d = new Date(s).getTime() - Date.now();
  return d > 0 && d < 60 * 86_400_000;
}

export function CertificatesManager() {
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Mijn certificaten</h2>
        {certs === null ? (
          <p className="mt-3 text-sm text-neutralx-400">Laden…</p>
        ) : certs.length === 0 ? (
          <p className="mt-3 rounded-xl border border-hair bg-white p-6 text-sm text-neutralx-500">
            Nog geen certificaten toegevoegd. Voeg ze rechts toe — opdrachtgevers zien welke je hebt en
            klussen die een certificaat vereisen worden niet meer geblokkeerd.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {certs.map((c) => {
              const s = STATUS[c.status];
              return (
                <li key={c.id} className="rounded-2xl border border-hair bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold text-ink">
                        {c.type === "OVERIG" && c.customLabel ? c.customLabel : TYPE_LABEL[c.type] ?? c.type}
                      </p>
                      <p className="mt-0.5 text-xs text-neutralx-500">
                        {[c.number ? `nr. ${c.number}` : null, c.issuedOn ? `afgegeven ${fmt(c.issuedOn)}` : null, c.expiresOn ? `geldig tot ${fmt(c.expiresOn)}` : "geen vervaldatum"]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
                  </div>
                  {c.statusNote && <p className="mt-2 text-xs text-neutralx-500">{c.statusNote}</p>}
                  {expiresSoon(c.expiresOn) && c.status === "valid" && (
                    <p className="mt-1.5 text-xs font-medium text-warn">Verloopt binnen 2 maanden — plan je herhaling.</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    {c.uploadId && (
                      <a
                        href={`/api/me/certificates/${c.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-brand-600 underline"
                      >
                        Bekijk upload
                      </a>
                    )}
                    <button type="button" onClick={() => remove(c.id)} className="font-medium text-neutralx-400 hover:text-crit">
                      Verwijderen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {certs !== null && !hasValidVca && (
          <div className="mt-4 rounded-xl border border-hair bg-paper-soft p-4 text-sm">
            <p className="font-semibold text-ink">Nog geen VCA?</p>
            <p className="mt-1 text-xs text-neutralx-600">
              Veel magazijn-, productie- en bouwklussen vragen een VCA-diploma.{" "}
              <Link href="/shop#vca-basis-boek" className="font-semibold text-brand-600 underline">
                Bestel het lesboek in de shop
              </Link>{" "}
              en voeg je diploma hier toe zodra je geslaagd bent.
            </p>
          </div>
        )}
      </div>

      <AddForm onAdded={load} />
    </div>
  );
}

function AddForm({ onAdded }: { onAdded: () => void }) {
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
      if (!r.ok) throw new Error(d?.error?.message ?? "Toevoegen mislukt");
      setMsg({
        t: "ok",
        s: d.certificate.status === "valid" ? "Toegevoegd en automatisch goedgekeurd." : "Toegevoegd — we controleren het.",
      });
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
      <h2 className="font-display text-lg font-bold text-ink">Certificaat toevoegen</h2>
      <label className="field-label mt-4 block">
        Type
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="field-input">
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      {type === "OVERIG" && (
        <label className="field-label mt-3 block">
          Naam van het certificaat
          <input name="customLabel" required className="field-input" placeholder="bijv. Werken op hoogte" />
        </label>
      )}
      <label className="field-label mt-3 block">
        Certificaat-/diplomanummer <span className="font-normal text-neutralx-400">(optioneel)</span>
        <input name="number" className="field-input" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="field-label">
          Afgegeven op
          <input type="date" name="issuedOn" className="field-input" />
        </label>
        <label className="field-label">
          Geldig tot
          <input type="date" name="expiresOn" className="field-input" />
        </label>
      </div>
      <label className="field-label mt-3 block">
        Scan of foto
        <div className="mt-1.5 rounded-lg border border-dashed border-hairstrong px-3 py-4">
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="text-sm text-neutralx-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          />
          <p className="mt-1 text-xs text-neutralx-400">
            {fileName ? `Gekozen: ${fileName}` : "JPG, PNG of PDF. Met vervaldatum + upload gaat goedkeuring automatisch."}
          </p>
        </div>
      </label>
      {msg && <p className={`mt-3 text-sm ${msg.t === "ok" ? "text-ok" : "text-crit"}`}>{msg.s}</p>}
      <button type="submit" disabled={busy} className="btn-primary mt-4 w-full disabled:opacity-50">
        {busy ? "Toevoegen…" : "Toevoegen"}
      </button>
    </form>
  );
}
