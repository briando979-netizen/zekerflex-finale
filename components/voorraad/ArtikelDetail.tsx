"use client";

import { useCallback, useEffect, useState } from "react";
import { REDENEN, REDEN_NAAM, nlGetal, type Artikel, type Mutatie } from "@/lib/voorraad/model";
import { ArtikelFormulier } from "@/components/voorraad/ArtikelFormulier";
import { leesFout } from "@/components/voorraad/fout";

// Onder een artikel: een mutatie of telling doen, het logboek (laatste 100), bewerken, archiveren en wissen.

const wanneer = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500 disabled:opacity-40";

export function ArtikelDetail({ artikel: a, vervang, verwijder, sluit }: { artikel: Artikel; vervang: (a: Artikel) => void; verwijder: (id: string) => void; sluit: () => void }) {
  const [mutaties, setMutaties] = useState<Mutatie[] | null>(null);
  const [reden, setReden] = useState<string>("inkoop");
  const [hoeveelheid, setHoeveelheid] = useState("");
  const [opmerking, setOpmerking] = useState("");
  const [bewerk, setBewerk] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [bevestig, setBevestig] = useState(false);

  const laadGeschiedenis = useCallback(async () => {
    try {
      const res = await fetch(`/api/werkgever/voorraad?artikel=${a.id}`, { cache: "no-store" });
      if (!res.ok) {
        setFout(await leesFout(res, "Het logboek kon niet worden geladen."));
        return;
      }
      setMutaties(((await res.json()) as { mutaties: Mutatie[] }).mutaties);
    } catch {
      setFout("Het logboek kon niet worden geladen. Controleer je verbinding.");
    }
  }, [a.id]);

  useEffect(() => {
    void laadGeschiedenis();
  }, [laadGeschiedenis]);

  async function patch(body: Record<string, unknown>, standaard: string): Promise<Artikel | null> {
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch("/api/werkgever/voorraad", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, ...body }) });
      if (!res.ok) {
        setFout(await leesFout(res, standaard));
        return null;
      }
      return ((await res.json()) as { artikel: Artikel }).artikel;
    } catch {
      setFout(`${standaard} Controleer je verbinding.`);
      return null;
    } finally {
      setBezig(false);
    }
  }

  async function doeMutatie(e: React.FormEvent) {
    e.preventDefault();
    const nieuw = await patch({ actie: "mutatie", reden, hoeveelheid, opmerking }, "De wijziging is niet gelukt.");
    if (!nieuw) return;
    vervang(nieuw);
    setHoeveelheid("");
    setOpmerking("");
    void laadGeschiedenis();
  }

  async function archiveer(aan: boolean) {
    const nieuw = await patch({ actie: aan ? "archiveren" : "terughalen" }, aan ? "Archiveren is niet gelukt." : "Terughalen is niet gelukt.");
    if (nieuw) vervang(nieuw);
  }

  async function wis() {
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch(`/api/werkgever/voorraad?id=${a.id}`, { method: "DELETE" });
      if (!res.ok) {
        setFout(await leesFout(res, "Wissen is niet gelukt."));
        setBevestig(false);
        return;
      }
      verwijder(a.id);
    } catch {
      setFout("Wissen is niet gelukt. Controleer je verbinding.");
    } finally {
      setBezig(false);
    }
  }

  const pre = `vr-mut-${a.id}`;
  const isTelling = reden === "telling";
  const isCorrectie = reden === "correctie";

  return (
    <div className="mt-4 space-y-4 border-t border-hair pt-4">
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}

      {bewerk ? (
        <ArtikelFormulier
          begin={a}
          opgeslagen={(n) => {
            vervang(n);
            setBewerk(false);
          }}
          annuleer={() => setBewerk(false)}
        />
      ) : (
        <>
          {a.notitie && <p className="text-sm text-neutralx-600">{a.notitie}</p>}
          {!a.gearchiveerd && (
            <form onSubmit={(e) => void doeMutatie(e)} className="grid gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor={`${pre}-reden`} className="field-label">
                  Reden
                </label>
                <select id={`${pre}-reden`} className="field-input" value={reden} onChange={(e) => setReden(e.target.value)}>
                  {REDENEN.map((r) => (
                    <option key={r} value={r}>
                      {REDEN_NAAM[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${pre}-aantal`} className="field-label">
                  {isTelling ? "Getelde aantal" : isCorrectie ? "Verschil (met + of -)" : "Hoeveelheid"}
                </label>
                <input id={`${pre}-aantal`} className="field-input" inputMode="decimal" required value={hoeveelheid} onChange={(e) => setHoeveelheid(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`${pre}-opm`} className="field-label">
                  Opmerking (niet verplicht)
                </label>
                <input id={`${pre}-opm`} className="field-input" maxLength={200} value={opmerking} onChange={(e) => setOpmerking(e.target.value)} />
              </div>
              <p className="text-xs text-neutralx-500 sm:col-span-4">
                {isTelling ? `Vul in hoeveel er nu echt ligt. Het verschil met de ${nlGetal(a.aantal)} in het systeem komt in het logboek.` : "Inkoop zet erbij; verkoop, gebruikt en verlies halen eraf."}
              </p>
              <div className="sm:col-span-4">
                <button type="submit" className="btn-primary" disabled={bezig}>
                  {isTelling ? "Telling vastleggen" : "Wijziging vastleggen"}
                </button>
              </div>
            </form>
          )}
          {a.gearchiveerd && <p className="text-sm text-neutralx-600">Dit artikel is gearchiveerd: het staat niet in de lijst en de voorraad kan niet worden gewijzigd. De geschiedenis blijft bewaard.</p>}
        </>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Logboek (laatste 100)</h3>
        {mutaties === null ? (
          <p className="text-sm text-neutralx-500">Laden…</p>
        ) : mutaties.length === 0 ? (
          <p className="text-sm text-neutralx-500">Nog geen wijzigingen. Het beginaantal was {nlGetal(a.begin)}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutralx-500">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Wanneer</th>
                  <th className="py-1 pr-3 font-semibold">Reden</th>
                  <th className="py-1 pr-3 text-right font-semibold">Verschil</th>
                  <th className="py-1 pr-3 text-right font-semibold">Nieuw aantal</th>
                  <th className="py-1 font-semibold">Opmerking</th>
                </tr>
              </thead>
              <tbody>
                {mutaties.map((m) => (
                  <tr key={m.id} className="border-t border-hair">
                    <td className="py-1 pr-3 text-neutralx-600">{wanneer(m.op)}</td>
                    <td className="py-1 pr-3 text-ink">{REDEN_NAAM[m.reden]}</td>
                    <td className="py-1 pr-3 text-right text-ink">{m.verschil > 0 ? `+${nlGetal(m.verschil)}` : nlGetal(m.verschil)}</td>
                    <td className="py-1 pr-3 text-right text-ink">{nlGetal(m.nieuwAantal)}</td>
                    <td className="py-1 text-neutralx-600">{m.opmerking}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!bewerk && !a.gearchiveerd && (
          <button type="button" className={knopKlein} onClick={() => setBewerk(true)}>
            Gegevens bewerken
          </button>
        )}
        {a.gearchiveerd ? (
          <button type="button" className={knopKlein} disabled={bezig} onClick={() => void archiveer(false)}>
            Terughalen
          </button>
        ) : (
          <button type="button" className={knopKlein} disabled={bezig} onClick={() => void archiveer(true)}>
            Archiveren
          </button>
        )}
        {mutaties !== null && mutaties.length === 0 &&
          (bevestig ? (
            <>
              <span className="text-xs text-neutralx-600">Zeker weten? Wissen kan niet ongedaan worden.</span>
              <button type="button" className={knopKlein} disabled={bezig} onClick={() => void wis()}>
                Ja, wissen
              </button>
              <button type="button" className={knopKlein} onClick={() => setBevestig(false)}>
                Nee
              </button>
            </>
          ) : (
            <button type="button" className={knopKlein} onClick={() => setBevestig(true)}>
              Wissen
            </button>
          ))}
        <button type="button" className={`${knopKlein} ml-auto`} onClick={sluit}>
          Sluiten
        </button>
      </div>
      {mutaties !== null && mutaties.length > 0 && <p className="text-xs text-neutralx-500">Een artikel met wijzigingen in het logboek kun je niet wissen, alleen archiveren.</p>}
    </div>
  );
}
