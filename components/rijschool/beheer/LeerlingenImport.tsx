"use client";

import { useMemo, useState } from "react";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import { foutVan } from "@/components/rijschool/api";
import { Melding } from "@/components/rijschool/ui";
import { leesLeerlingen } from "@/lib/rijschool/import";

// Leerlingen overnemen uit een export van je oude software of een Excel-lijst (lib/rijschool/import.ts): plakken of een
// bestand kiezen, een voorbeeld met de problemen per regel, en pas na een klik worden ze toegevoegd. Er gaat geen mail uit:
// uitnodigen doe je daarna zelf, per leerling.

const VOORBEELD = "Naam;E-mail;Telefoon;Adres\nAnna de Vries;anna@voorbeeld.nl;06 12345678;Kerkstraat 1, Groningen";

export function LeerlingenImport({ doe, onKlaar }: { doe: Doe; onKlaar: () => void }) {
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const uitslag = useMemo(() => leesLeerlingen(tekst), [tekst]);

  async function kiesBestand(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2_000_000) return setFout("Dit bestand is te groot. Een lijst met leerlingen is meestal een paar honderd kilobyte.");
    setFout(null);
    setOk(null);
    setTekst(await f.text());
  }

  async function neemOver() {
    setBezig(true);
    setFout(null);
    setOk(null);
    try {
      const r = await doe({ actie: "importeer", rijen: uitslag.rijen });
      const nieuw = Number(r.overgenomen ?? 0);
      const bestond = Number(r.bestonden ?? 0);
      setOk(`${nieuw} leerling${nieuw === 1 ? "" : "en"} overgenomen${bestond > 0 ? `, ${bestond} stond${bestond === 1 ? "" : "en"} er al en ${bestond === 1 ? "is" : "zijn"} overgeslagen` : ""}.`);
      setTekst("");
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink">Leerlingen overnemen</h2>
        <button type="button" className="text-sm font-semibold text-brand-600 hover:underline" onClick={onKlaar}>
          ← Alle leerlingen
        </button>
      </div>
      <p className="text-sm leading-relaxed text-neutralx-600">
        Stap over van andere software of een Excel-lijst. Exporteer je leerlingen als CSV (de meeste pakketten en Excel kunnen dat), kies het bestand of plak de tekst. De eerste regel moet kolomkoppen hebben, met minstens een naam (of voornaam en achternaam) en een e-mailadres. Telefoon en adres (of straat, postcode en plaats) nemen we mee als ze erin staan. Er gaat geen mail naar je leerlingen: uitnodigen doe je daarna zelf.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-ghost cursor-pointer">
          Kies een bestand
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void kiesBestand(e)} />
        </label>
        <button type="button" className="text-sm font-semibold text-brand-600 hover:underline" onClick={() => setTekst(VOORBEELD)}>
          Toon een voorbeeld
        </button>
      </div>
      <label className="block text-sm font-medium text-ink">
        Of plak de tekst hier
        <textarea className="field-input mt-1 min-h-32 font-mono text-xs" value={tekst} onChange={(e) => setTekst(e.target.value)} spellCheck={false} />
      </label>

      {tekst.trim() !== "" && (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <strong>{uitslag.rijen.length}</strong> leerling{uitslag.rijen.length === 1 ? "" : "en"} klaar om over te nemen
            {uitslag.kolommen.length > 0 ? ` (kolommen: ${uitslag.kolommen.join(", ")})` : ""}.
          </p>
          {uitslag.rijen.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-neutralx-200">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="bg-paper text-xs text-neutralx-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Naam</th>
                    <th scope="col" className="px-3 py-2 font-medium">E-mail</th>
                    <th scope="col" className="px-3 py-2 font-medium">Telefoon</th>
                    <th scope="col" className="px-3 py-2 font-medium">Adres</th>
                  </tr>
                </thead>
                <tbody>
                  {uitslag.rijen.slice(0, 5).map((l) => (
                    <tr key={l.email} className="border-t border-neutralx-200">
                      <td className="px-3 py-2">{l.naam}</td>
                      <td className="px-3 py-2">{l.email}</td>
                      <td className="px-3 py-2">{l.telefoon || "–"}</td>
                      <td className="px-3 py-2">{l.adres || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {uitslag.rijen.length > 5 && <p className="border-t border-neutralx-200 px-3 py-2 text-xs text-neutralx-600">… en {uitslag.rijen.length - 5} meer</p>}
            </div>
          )}
          {uitslag.fouten.length > 0 && (
            <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-ink">
              <p className="font-semibold">{uitslag.fouten.length} regel{uitslag.fouten.length === 1 ? "" : "s"} worden overgeslagen:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {uitslag.fouten.slice(0, 8).map((f) => (
                  <li key={`${f.regel}-${f.reden}`}>
                    regel {f.regel}: {f.reden}
                  </li>
                ))}
              </ul>
              {uitslag.fouten.length > 8 && <p className="mt-1 text-xs">… en {uitslag.fouten.length - 8} meer</p>}
            </div>
          )}
          <button type="button" className="btn-primary" disabled={bezig || uitslag.rijen.length === 0} onClick={() => void neemOver()}>
            {bezig ? "Bezig…" : `${uitslag.rijen.length} leerling${uitslag.rijen.length === 1 ? "" : "en"} overnemen`}
          </button>
        </div>
      )}
      <Melding fout={fout} ok={ok} />
    </div>
  );
}
