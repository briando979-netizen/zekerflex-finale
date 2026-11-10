"use client";

import { useEffect, useState } from "react";
import { UitzendContractCard } from "@/components/app/UitzendContractCard";

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
  ibanPendingVerification: boolean;
  bsnLast4: string | null;
}

export function UitzendPanel() {
  const [s, setS] = useState<Status | null>(null);
  const [f, setF] = useState<Fiscal | null>(null);
  const load = () =>
    fetch("/api/me/uitzend", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setS(d.status);
        setF(d.fiscal);
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

  const contractBlock = (
    <div>
      <p className="field-label">Uitzendovereenkomst</p>
      <div className="mt-2">
        <UitzendContractCard />
      </div>
    </div>
  );

  if (!s || !f) return <div className="space-y-6 text-sm">{contractBlock}</div>;

  return (
    <div className="space-y-6 text-sm">
      {contractBlock}

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

      {/* Het rekeningnummer vul je in bij "Bankrekening bevestigen" (hierboven op deze pagina). */}
      {f.bsnLast4 && (
        <p className="text-xs text-neutralx-400">BSN bekend (eindigt op {f.bsnLast4}) — nooit onversleuteld opgeslagen.</p>
      )}
    </div>
  );
}
