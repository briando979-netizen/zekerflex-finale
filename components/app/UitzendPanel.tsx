"use client";

import { useEffect, useState } from "react";

interface Status {
  weeksWorked: number;
  hoursWorked: number;
  phase: string;
  phaseLabel: string;
  stipp: string;
  stippLabel: string;
  weeksToStippBasis: number;
  weeksToStippPlus: number;
  currentContractHours: number;
  nextContractAtHours: number;
  hoursToNextContract: number;
  nextContractReady: boolean;
}
interface Fiscal {
  loonheffingskorting: boolean;
  iban: string | null;
  ibanValid: boolean;
  bsnLast4: string | null;
}

// MOD-97 IBAN checksum, mirrors lib/billing/sepa.ts for a live hint.
function ibanLooksValid(raw: string): boolean {
  const v = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const re = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of re) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export function UitzendPanel() {
  const [s, setS] = useState<Status | null>(null);
  const [f, setF] = useState<Fiscal | null>(null);
  const [iban, setIban] = useState("");
  const [savingIban, setSavingIban] = useState(false);

  const load = () =>
    fetch("/api/me/uitzend", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setS(d.status);
        setF(d.fiscal);
        setIban(d.fiscal?.iban ?? "");
      })
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const toggleLh = async () => {
    if (!f) return;
    const next = !f.loonheffingskorting;
    setF({ ...f, loonheffingskorting: next });
    await fetch("/api/me/uitzend", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loonheffingskorting: next }),
    });
  };

  const saveIban = async () => {
    setSavingIban(true);
    try {
      const r = await fetch("/api/me/uitzend", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban }),
      });
      if (r.ok) {
        const d = await r.json();
        setF((p) => (p ? { ...p, iban: d.iban, ibanValid: d.ibanValid } : p));
      }
    } finally {
      setSavingIban(false);
    }
  };

  if (!s || !f) return null;
  const ibanHint = iban.length >= 15 ? (ibanLooksValid(iban) ? "geldig" : "checksum klopt niet") : "";

  return (
    <div className="space-y-6 text-sm">
      {/* ABU phase / contract hours */}
      <div>
        <p className="field-label">Fase & contracturen (ABU)</p>
        <div className="mt-2 rounded-xl border border-hair p-4">
          <p className="font-semibold text-ink">{s.phaseLabel}</p>
          <p className="mt-1 text-xs text-neutralx-500">
            {s.weeksWorked} gewerkte weken · {s.hoursWorked} uur totaal
          </p>
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-paper-soft">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{
                  width: `${Math.min(100, (1 - s.hoursToNextContract / (s.nextContractAtHours - s.currentContractHours)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-neutralx-500">
              Nog {s.hoursToNextContract} uur tot je volgende contract ({s.nextContractAtHours} uur).
            </p>
          </div>
          {s.nextContractReady && (
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
              🎉 Je volgende contract staat klaar — je ziet het automatisch bij je uitzendbureau-overzicht.
            </p>
          )}
        </div>
      </div>

      {/* StiPP */}
      <div>
        <p className="field-label">StiPP pensioen</p>
        <div className="mt-2 rounded-xl border border-hair p-4">
          <p className="font-semibold text-ink">{s.stippLabel}</p>
          {s.stipp === "geen" && s.weeksToStippBasis > 0 && (
            <p className="mt-1 text-xs text-neutralx-500">Nog {s.weeksToStippBasis} weken tot de basisregeling.</p>
          )}
          {s.stipp === "basis" && s.weeksToStippPlus > 0 && (
            <p className="mt-1 text-xs text-neutralx-500">Nog {s.weeksToStippPlus} weken tot de plusregeling.</p>
          )}
          <ul className="mt-2 space-y-1 text-xs text-neutralx-500">
            <li>Basisregeling: vanaf 9 gewerkte weken, jouw inleg.</li>
            <li>Plusregeling: na 78 weken, met werkgeversbijdrage.</li>
          </ul>
        </div>
      </div>

      {/* Loonheffingskorting */}
      <label className="flex items-start gap-3 rounded-xl border border-hair p-4">
        <input
          type="checkbox"
          checked={f.loonheffingskorting}
          onChange={toggleLh}
          className="mt-0.5 accent-brand-500"
        />
        <span>
          <span className="block font-semibold text-ink">Loonheffingskorting toepassen</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">
            Zet dit alleen aan bij je hoofdinkomen. Heb je meerdere werkgevers? Dan bij één.
            {f.loonheffingskorting ? " Nu: aan." : " Nu: uit."}
          </span>
        </span>
      </label>

      {/* IBAN + controle */}
      <div>
        <p className="field-label">Rekeningnummer (IBAN)</p>
        <p className="mt-0.5 text-xs text-neutralx-500">
          We controleren dit met de checksum én je geüploade bankafschrift.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value.toUpperCase())}
            placeholder="NL00 BANK 0000 0000 00"
            className="field-input flex-1 font-mono"
          />
          <button type="button" onClick={saveIban} disabled={savingIban} className="btn-ghost">
            {savingIban ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
        <p className="mt-1 text-xs">
          {ibanHint && (
            <span className={ibanLooksValid(iban) ? "text-ok" : "text-crit"}>{ibanHint}</span>
          )}
          {f.ibanValid && !ibanHint && <span className="text-ok">opgeslagen IBAN is gecontroleerd ✓</span>}
        </p>
        {f.bsnLast4 && (
          <p className="mt-2 text-xs text-neutralx-400">BSN bekend (eindigt op {f.bsnLast4}) — nooit onversleuteld opgeslagen.</p>
        )}
      </div>
    </div>
  );
}
