"use client";

import { useMemo, useState } from "react";
import { BEHEER_API, KNOP_LICHT, Melding, VELD, VELD_BASIS, dagNaam, useBeheerData, vraag } from "@/components/voorstel/beheer/api";

// Accounts: klanten en beheerders. Rol wijzigen, blokkeren, verwijderen. Je
// eigen account staat erbij maar kun je hier niet aanpassen.

interface Acc {
  email: string;
  naam: string;
  telefoon: string;
  rol: "klant" | "beheerder";
  geblokkeerd: boolean;
  aangemaakt: string;
  laatstIngelogd?: string;
}

const URL_ACC = `${BEHEER_API}/accounts`;

export function Accounts() {
  const { data, setData, fout, setFout } = useBeheerData<{ accounts: Acc[]; ik: string | null }>(URL_ACC);
  const [zoek, setZoek] = useState("");
  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (data?.accounts ?? []).filter((a) => !q || `${a.naam} ${a.email} ${a.telefoon}`.toLowerCase().includes(q));
  }, [data, zoek]);

  async function wijzig(a: Acc, w: { rol?: Acc["rol"]; geblokkeerd?: boolean }) {
    try {
      const { account } = await vraag<{ account: Acc }>(URL_ACC, { method: "PATCH", body: { email: a.email, ...w } });
      setData((d) => (d ? { ...d, accounts: d.accounts.map((x) => (x.email === a.email ? account : x)) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    }
  }
  async function verwijder(a: Acc) {
    if (!window.confirm(`Account van ${a.naam} (${a.email}) verwijderen? Reserveringen blijven bestaan.`)) return;
    try {
      await vraag(URL_ACC, { method: "DELETE", body: { email: a.email } });
      setData((d) => (d ? { ...d, accounts: d.accounts.filter((x) => x.email !== a.email) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, e-mail of telefoon" aria-label="Zoek accounts" className={`${VELD} max-w-xs`} />
        <p className="text-sm text-schw-mute">
          {data ? `${data.accounts.length} accounts, waarvan ${data.accounts.filter((a) => a.rol === "beheerder").length} beheerder(s)` : "Laden…"}
        </p>
      </div>
      <Melding fout={fout} />
      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-schw-night/10 text-xs uppercase tracking-wide text-schw-mute">
            <tr>
              <th className="px-4 py-3">Naam</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Laatst ingelogd</th>
              <th className="px-4 py-3 text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {lijst.map((a) => {
              const ik = data?.ik === a.email;
              return (
                <tr key={a.email} className={`border-b border-schw-night/5 last:border-0 ${a.geblokkeerd ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-semibold">
                    {a.naam}
                    {ik && <span className="ml-2 rounded-full bg-schw-sand px-2 py-0.5 text-xs">jij</span>}
                    {a.geblokkeerd && <span className="ml-2 rounded-full bg-[#FDE2E2] px-2 py-0.5 text-xs text-[#B91C1C]">geblokkeerd</span>}
                  </td>
                  <td className="px-4 py-3 text-schw-mute">
                    {a.email}
                    <br />
                    {a.telefoon}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={a.rol}
                      disabled={ik}
                      onChange={(e) => void wijzig(a, { rol: e.target.value as Acc["rol"] })}
                      aria-label={`Rol van ${a.naam}`}
                      className={`${VELD_BASIS} w-auto py-1.5`}
                    >
                      <option value="klant">Klant</option>
                      <option value="beheerder">Beheerder</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-schw-mute">{a.laatstIngelogd ? dagNaam(a.laatstIngelogd.slice(0, 10), { day: "numeric", month: "short", year: "numeric" }) : "–"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={ik} onClick={() => void wijzig(a, { geblokkeerd: !a.geblokkeerd })} className={KNOP_LICHT}>
                        {a.geblokkeerd ? "Deblokkeer" : "Blokkeer"}
                      </button>
                      <button type="button" disabled={ik} onClick={() => void verwijder(a)} className={`${KNOP_LICHT} text-[#B91C1C]`}>
                        Verwijder
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data && lijst.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-schw-mute">
                  Geen accounts gevonden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
