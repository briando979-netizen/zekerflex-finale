"use client";

import { useEffect, useState } from "react";
import { UitzendContractCard } from "@/components/app/UitzendContractCard";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";

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
  /** de werker koos de korting uitdrukkelijk; zonder keuze geldt geen korting */
  loonheffingskortingGekozen: boolean;
  iban: string | null;
  ibanValid: boolean;
  ibanPendingVerification: boolean;
  bsnLast4: string | null;
}

export function UitzendPanel() {
  const t = useFT().uitzendPanel;
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

  const [lhFout, setLhFout] = useState(false);
  const toggleLh = async () => {
    if (!f) return;
    const next = !f.loonheffingskorting;
    setLhFout(false);
    try {
      const res = await fetch("/api/me/uitzend", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loonheffingskorting: next }),
      });
      const d = (await res.json().catch(() => null)) as { loonheffingskorting?: boolean; loonheffingskortingGekozen?: boolean } | null;
      if (!res.ok || typeof d?.loonheffingskorting !== "boolean") {
        setLhFout(true);
        return;
      }
      // de teruggegeven serverversie vervangt wat er stond
      setF({ ...f, loonheffingskorting: d.loonheffingskorting, loonheffingskortingGekozen: d.loonheffingskortingGekozen === true });
    } catch {
      setLhFout(true);
    }
  };

  const contractBlock = (
    <div>
      <p className="field-label">{t.overeenkomst}</p>
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
        <p className="field-label">{t.faseKop}</p>
        <div className="mt-2 rounded-xl border border-hair p-4">
          <p className="font-semibold text-ink">{t.fase[s.phase as "A" | "B" | "C"] ?? s.phaseLabel}</p>
          <p className="mt-1 text-xs text-neutralx-500">
            {vulIn(t.gewerkt, { weken: s.weeksWorked, uren: s.hoursWorked })}
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
              {vulIn(t.nogUren, { uren: s.hoursToNextContract, van: s.nextContractAtHours })}
            </p>
          </div>
          {s.nextContractReady && (
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
              {t.volgendeKlaar}
            </p>
          )}
        </div>
      </div>

      {/* StiPP */}
      <div>
        <p className="field-label">{t.stippKop}</p>
        <div className="mt-2 rounded-xl border border-hair p-4">
          <p className="font-semibold text-ink">{t.stipp[s.stipp as "geen" | "basis" | "plus"] ?? s.stippLabel}</p>
          {s.stipp === "geen" && s.weeksToStippBasis > 0 && (
            <p className="mt-1 text-xs text-neutralx-500">{vulIn(t.nogWekenBasis, { weken: s.weeksToStippBasis })}</p>
          )}
          {s.stipp === "basis" && s.weeksToStippPlus > 0 && (
            <p className="mt-1 text-xs text-neutralx-500">{vulIn(t.nogWekenPlus, { weken: s.weeksToStippPlus })}</p>
          )}
          <ul className="mt-2 space-y-1 text-xs text-neutralx-500">
            <li>{t.basisRegel}</li>
            <li>{t.plusRegel}</li>
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
          <span className="block font-semibold text-ink">{t.lhkTitel}</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">
            {t.lhkUitleg}
            {f.loonheffingskorting ? t.nuAan : t.nuUit}
          </span>
        </span>
      </label>
      {!f.loonheffingskortingGekozen && <p role="status" className="-mt-4 text-xs font-medium text-ink">{t.lhkKies}</p>}
      {lhFout && <p role="alert" className="-mt-4 text-xs font-medium text-crit">{t.lhkFout}</p>}

      {/* Het rekeningnummer vul je in bij "Bankrekening bevestigen" (hierboven op deze pagina). Het BSN vul je hier niet in:
          dat staat in "Je gegevens" (GegevensMist); dit paneel toont alleen de stand. */}
      <p className="text-xs text-neutralx-500">{f.bsnLast4 ? vulIn(t.bsnBekend, { laatste4: f.bsnLast4 }) : t.bsnOntbreekt}</p>
    </div>
  );
}
