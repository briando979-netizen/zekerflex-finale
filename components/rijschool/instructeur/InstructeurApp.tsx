"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstructeurWeergave } from "@/lib/rijschool/weergave";
import { foutVan, stuur } from "@/components/rijschool/api";
import { LesStatus, Melding } from "@/components/rijschool/ui";
import { LesScherm } from "@/components/rijschool/instructeur/LesScherm";
import { datumKort, datumLang, metHoofdletter, SOORT_LABEL, tijd } from "@/lib/rijschool/format";
import { plusDagen } from "@/lib/rijschool/planning";
import { tegoedTekst } from "@/lib/rijschool/tegoed";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// De app van een instructeur: de lesdag (vorige/volgende dag), per les het
// lesscherm, en een lijst van je leerlingen met tegoed en volgende les.

export function InstructeurApp({ slug, begin }: { slug: string; begin: InstructeurWeergave }) {
  const router = useRouter();
  const api = `/api/rijschool/site/${slug}/instructeur`;
  const [d, setD] = useState(begin);
  const [lesId, setLesId] = useState<string | null>(null);
  const [tab, setTab] = useState<"dag" | "leerlingen">("dag");
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const vandaag = amsterdamDayKey(new Date());

  async function laadDag(datum: string) {
    setFout(null);
    setOk(null);
    try {
      setD(await stuur<InstructeurWeergave>(`${api}?datum=${datum}`));
    } catch (e) {
      setFout(foutVan(e));
    }
  }

  async function actie(body: Record<string, unknown>, melding: string): Promise<boolean> {
    setFout(null);
    setOk(null);
    try {
      setD(await stuur<InstructeurWeergave>(`${api}?datum=${d.datum}`, "POST", body));
      setOk(melding);
      return true;
    } catch (e) {
      const m = foutVan(e);
      setFout(m);
      if (/log in als instructeur|log opnieuw in/i.test(m)) router.replace(`/rijschool/${slug}/inloggen?soort=instructeur`);
      return false;
    }
  }

  async function uitloggen() {
    await stuur(`/api/rijschool/site/${slug}/account`, "POST", { actie: "uitloggen" }).catch(() => undefined);
    router.replace(`/rijschool/${slug}/inloggen?soort=instructeur`);
    router.refresh();
  }

  const les = lesId ? d.lessen.find((l) => l.id === lesId) : undefined;

  return (
    <div className="space-y-4">
      <Melding fout={fout} ok={ok} />
      {les ? (
        <LesScherm key={les.id} les={les} d={d} api={api} actie={actie} onTerug={() => setLesId(null)} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-bold">Hoi {d.instructeur.naam.split(" ")[0]}</h1>
            <button type="button" className="text-sm font-semibold underline underline-offset-2" onClick={uitloggen}>
              Uitloggen
            </button>
          </div>
          <div role="tablist" aria-label="Instructeur-app" className="grid grid-cols-2 gap-1 rounded-full bg-paper-soft p-1">
            {(
              [
                ["dag", "Lesdag"],
                ["leerlingen", "Mijn leerlingen"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? "bg-white shadow-sm" : "text-neutralx-600"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "dag" ? (
            <>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-ghost !px-3" onClick={() => laadDag(plusDagen(d.datum, -1))} aria-label="Vorige dag">
                  ←
                </button>
                <p className="min-w-0 flex-1 text-center font-semibold">{d.datum === vandaag ? "Vandaag" : metHoofdletter(datumLang(`${d.datum}T12:00:00Z`))}</p>
                <button type="button" className="btn-ghost !px-3" onClick={() => laadDag(plusDagen(d.datum, 1))} aria-label="Volgende dag">
                  →
                </button>
              </div>
              {d.datum !== vandaag && (
                <button type="button" className="w-full text-center text-sm font-semibold underline underline-offset-2" onClick={() => laadDag(vandaag)}>
                  Naar vandaag
                </button>
              )}
              {d.lessen.length === 0 ? (
                <p className="rounded-2xl border border-hair bg-white p-5 text-sm text-neutralx-600">Geen lessen op deze dag.</p>
              ) : (
                <ul className="space-y-2">
                  {d.lessen.map((l) => (
                    <li key={l.id}>
                      <button type="button" onClick={() => setLesId(l.id)} className={`w-full rounded-2xl border border-hair bg-white p-4 text-left hover:border-neutralx-300 ${l.status === "GEANNULEERD" ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="num font-semibold">
                              {tijd(l.start)} – {tijd(l.eind)} · {SOORT_LABEL[l.soort]}
                            </p>
                            <p className="truncate text-sm">{l.leerlingNaam ?? "Geen leerling"}</p>
                            {l.ophaaladres && <p className="truncate text-xs text-neutralx-500">{l.ophaaladres}</p>}
                            {l.leerling && l.leerling.saldoMin <= 0 && l.soort === "LES" && <p className="text-xs font-semibold text-crit">Tegoed: {tegoedTekst(l.leerling.saldoMin, d.rijschool.lesMinuten)}</p>}
                          </div>
                          <LesStatus status={l.status} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : d.leerlingen.length === 0 ? (
            <p className="rounded-2xl border border-hair bg-white p-5 text-sm text-neutralx-600">Nog geen leerlingen gekoppeld.</p>
          ) : (
            <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white">
              {d.leerlingen.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 p-4">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{l.naam}</span>
                    <span className="block text-xs text-neutralx-500">
                      {l.procent}% · {tegoedTekst(l.saldoMin, d.rijschool.lesMinuten)}
                    </span>
                  </span>
                  <span className="text-right text-xs text-neutralx-600">{l.volgende ? `Volgende: ${datumKort(l.volgende)} ${tijd(l.volgende)}` : "Geen les gepland"}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
