"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Notice, Panel } from "@/components/admin/kit";
import { boekApi, jsonInit } from "@/lib/boekhouding/scherm-api";
import { afzenderFout, schoonAfzender } from "@/lib/boekhouding/scherm-kern";

export function AfzendersTab() {
  const [lijst, setLijst] = useState<string[] | null>(null);
  const [nieuw, setNieuw] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    try {
      setLijst((await boekApi<{ afzenders: string[] }>("/afzenders")).afzenders);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  // Bewaart de hele nieuwe lijst en neemt wat de server teruggeeft over.
  const bewaar = async (volgende: string[], tekst: string) => {
    setBezig(true);
    try {
      const r = await boekApi<{ afzenders: string[] }>("/afzenders", jsonInit("PUT", { afzenders: volgende }));
      setLijst(r.afzenders);
      setFout(null);
      setMelding(tekst);
      return true;
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
      return false;
    } finally {
      setBezig(false);
    }
  };

  const voegToe = async () => {
    const fouttekst = afzenderFout(nieuw);
    if (fouttekst) {
      setFout(fouttekst);
      return;
    }
    const s = schoonAfzender(nieuw);
    const huidig = lijst ?? [];
    if (huidig.includes(s)) {
      setFout("Deze afzender staat er al op.");
      return;
    }
    if (await bewaar([...huidig, s], "De afzender is toegevoegd.")) setNieuw("");
  };

  return (
    <div className="space-y-5">
      <Notice tone="plan">
        Alleen mail van deze afzenders wordt automatisch geboekt, en alleen als de afzender klopt (SPF en DKIM).{" "}
        {lijst !== null && lijst.length === 0
          ? "De lijst is nu leeg, dus alles komt bij ‘even kijken’."
          : "Mail van alle andere afzenders komt bij ‘even kijken’."}
      </Notice>
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {melding && <Notice tone="ok">{melding}</Notice>}
      <Panel title="Eigen afzenders" subtitle="Bijvoorbeeld factuur@hetzner.com, of een heel bedrijf: @hetzner.com.">
        {lijst !== null && lijst.length === 0 ? (
          <Empty title="De lijst is leeg" body="Alles wat per mail binnenkomt gaat naar 'even kijken' en wordt niet vanzelf geboekt." />
        ) : (
          <ul className="divide-y text-sm" style={{ borderColor: "var(--a-border)" }}>
            {(lijst ?? []).map((a) => (
              <li key={a} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 break-all">{a}</span>
                <button type="button" className="a-btn text-xs" disabled={bezig} onClick={() => void bewaar((lijst ?? []).filter((x) => x !== a), "De afzender is verwijderd.")}>
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="a-label min-w-0 flex-1" htmlFor="nieuwe-afzender">
            Nieuwe afzender
            <input id="nieuwe-afzender" className="a-input" value={nieuw} placeholder="factuur@bedrijf.nl of @bedrijf.nl" autoComplete="off" onChange={(e) => setNieuw(e.target.value)} />
          </label>
          <button type="button" className="a-btn a-btn-primary" disabled={bezig || !nieuw.trim()} onClick={() => void voegToe()}>
            Toevoegen
          </button>
        </div>
      </Panel>
    </div>
  );
}
