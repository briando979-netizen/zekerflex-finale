"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { InstructeurWeergave } from "@/lib/rijschool/weergave";
import { foutVan, stuur } from "@/components/rijschool/api";
import { LesStatus, Melding } from "@/components/rijschool/ui";
import { LesScherm } from "@/components/rijschool/instructeur/LesScherm";
import { datumKort, datumLang, metHoofdletter, SOORT_LABEL, tijd } from "@/lib/rijschool/format";
import { plusDagen } from "@/lib/rijschool/planning";
import { tegoedTekst } from "@/lib/rijschool/tegoed";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import type { BerichtRij } from "@/lib/rijschool/berichten-lijst";
import { bezorgUitleg, GesprekkenLijst, GesprekPaneel } from "@/components/rijschool/Gesprekken";
import { sitePad } from "@/lib/rijschool/domein-pad";

// De app van een instructeur: de lesdag (vorige/volgende dag), per les het
// lesscherm, een lijst van je leerlingen met tegoed en volgende les, en de
// berichten met je eigen leerlingen (lib/rijschool/berichten.ts).

export function InstructeurApp({ slug, basis, begin }: { slug: string; basis: string; begin: InstructeurWeergave }) {
  const router = useRouter();
  const api = `/api/rijschool/site/${slug}/instructeur`;
  const [d, setD] = useState(begin);
  const [lesId, setLesId] = useState<string | null>(null);
  const [tab, setTab] = useState<"dag" | "leerlingen" | "berichten">("dag");
  const [gesprek, setGesprek] = useState<string | null>(null);
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
      if (/log in als instructeur|log opnieuw in/i.test(m)) router.replace(sitePad(basis, "/inloggen?soort=instructeur"));
      return false;
    }
  }

  async function uitloggen() {
    await stuur(`/api/rijschool/site/${slug}/account`, "POST", { actie: "uitloggen" }).catch(() => undefined);
    router.replace(sitePad(basis, "/inloggen?soort=instructeur"));
    router.refresh();
  }

  const les = lesId ? d.lessen.find((l) => l.id === lesId) : undefined;
  const ongelezen = d.gesprekken.reduce((s, g) => s + g.ongelezen, 0);
  const gesprekLeerling = gesprek ? d.leerlingen.find((l) => l.id === gesprek) : undefined;
  const datum = d.datum;

  // berichten met een eigen leerling; elke POST geeft de nieuwe stand (met de gesprekken) terug
  const laadGesprek = useCallback(async () => (await stuur<{ berichten: BerichtRij[] }>(`${api}?berichten=${encodeURIComponent(gesprek ?? "")}`)).berichten, [api, gesprek]);
  const stuurBericht = useCallback(
    async (tekst: string) => {
      if (gesprek) setD(await stuur<InstructeurWeergave>(`${api}?datum=${datum}`, "POST", { actie: "bericht", leerlingId: gesprek, tekst }));
    },
    [api, gesprek, datum],
  );
  const gesprekGelezen = useCallback(async () => {
    if (gesprek) setD(await stuur<InstructeurWeergave>(`${api}?datum=${datum}`, "POST", { actie: "berichtGelezen", leerlingId: gesprek }));
  }, [api, gesprek, datum]);

  function openGesprek(leerlingId: string) {
    setGesprek(leerlingId);
    setTab("berichten");
  }

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
          <div role="tablist" aria-label="Instructeur-app" className="grid grid-cols-3 gap-1 rounded-full bg-paper-soft p-1">
            {(
              [
                ["dag", "Lesdag"],
                ["leerlingen", "Leerlingen"],
                ["berichten", "Berichten"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`whitespace-nowrap rounded-full px-2 py-2 text-sm font-semibold ${tab === id ? "bg-white shadow-sm" : "text-neutralx-600"}`}
              >
                {label}
                {id === "berichten" && ongelezen > 0 && (
                  <span className="num ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-900">
                    {ongelezen}
                    <span className="sr-only"> nieuw</span>
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "berichten" ? (
            gesprekLeerling ? (
              <GesprekPaneel
                key={gesprekLeerling.id}
                leerlingNaam={gesprekLeerling.naam}
                uitleg={bezorgUitleg(gesprekLeerling)}
                kleur={d.rijschool.kleur}
                laad={laadGesprek}
                verstuur={stuurBericht}
                gelezen={gesprekGelezen}
                onTerug={() => setGesprek(null)}
                terugAltijd
              />
            ) : (
              <GesprekkenLijst
                gesprekken={d.gesprekken}
                kandidaten={d.leerlingen}
                focus={gesprek}
                onFocus={setGesprek}
                leeg="Nog geen berichten met je leerlingen. Ze kunnen je schrijven vanuit hun app; jij kunt hieronder een gesprek beginnen."
              />
            )
          ) : tab === "dag" ? (
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
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-right text-xs text-neutralx-600">{l.volgende ? `Volgende: ${datumKort(l.volgende)} ${tijd(l.volgende)}` : "Geen les gepland"}</span>
                    <button type="button" className="text-xs font-semibold underline underline-offset-2" onClick={() => openGesprek(l.id)} aria-label={`Bericht aan ${l.naam}`}>
                      Bericht
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
