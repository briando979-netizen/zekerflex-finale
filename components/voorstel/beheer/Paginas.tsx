"use client";

import { useEffect, useState } from "react";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, Melding, VELD, useBeheerData, vraag } from "@/components/voorstel/beheer/api";

// Teksten zelf aanpassen: kies een pagina, wijzig titel, kop en de tekst van
// koppen, alinea's en lijsten. Foto's en arrangementen blijven staan.

type Veld =
  | { index: number; soort: "kop"; tekst: string }
  | { index: number; soort: "alinea"; tekst: string; opmaak: boolean }
  | { index: number; soort: "lijst"; regels: string[] }
  | { index: number; soort: "vast"; omschrijving: string };
interface Detail {
  pad: string;
  titel: string;
  heroKop: string;
  blokken: Veld[];
}

const URL_PAG = `${BEHEER_API}/paginas`;

export function Paginas() {
  const lijst = useBeheerData<{ paginas: { pad: string; titel: string; bewerkt: boolean; url: string }[] }>(URL_PAG);
  const [pad, setPad] = useState("");
  const [detail, setDetailRuw] = useState<Detail | null>(null);
  // nieuwe versie = invoervelden opnieuw vullen (ze zijn ongecontroleerd)
  const [versie, setVersie] = useState(0);
  const laadDetail = (d: Detail | null) => {
    setDetailRuw(d);
    setVersie((v) => v + 1);
  };
  const setDetail = (d: Detail) => setDetailRuw(d);
  const [wijzig, setWijzig] = useState<Record<number, string | string[]>>({});
  const [ok, setOk] = useState("");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    laadDetail(null);
    setWijzig({});
    setOk("");
    if (!pad) return;
    vraag<Detail>(`${URL_PAG}?pad=${encodeURIComponent(pad)}`)
      .then(laadDetail)
      .catch((e: unknown) => setFout(e instanceof Error ? e.message : "Laden mislukt."));
  }, [pad]);

  async function bewaar() {
    if (!detail) return;
    setBezig(true);
    setFout("");
    try {
      await vraag(URL_PAG, { method: "PUT", body: { pad: detail.pad, titel: detail.titel, heroKop: detail.heroKop, blokken: wijzig } });
      setOk("Opgeslagen. Bezoekers zien de nieuwe tekst meteen.");
      void lijst.laad();
      laadDetail(await vraag<Detail>(`${URL_PAG}?pad=${encodeURIComponent(detail.pad)}`));
      setWijzig({});
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  }

  async function terug() {
    if (!detail || !window.confirm("Alle wijzigingen op deze pagina terugzetten naar de originele tekst?")) return;
    try {
      await vraag(URL_PAG, { method: "DELETE", body: { pad: detail.pad } });
      setOk("Teruggezet naar de originele tekst.");
      void lijst.laad();
      laadDetail(await vraag<Detail>(`${URL_PAG}?pad=${encodeURIComponent(detail.pad)}`));
      setWijzig({});
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Terugzetten mislukt.");
    }
  }

  const huidig = lijst.data?.paginas.find((p) => p.pad === pad);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={pad} onChange={(e) => setPad(e.target.value)} aria-label="Kies een pagina" className={`${VELD} max-w-md`}>
          <option value="">Kies een pagina om te bewerken…</option>
          {lijst.data?.paginas.map((p) => (
            <option key={p.pad} value={p.pad}>
              {p.titel} ({p.pad}){p.bewerkt ? " · bewerkt" : ""}
            </option>
          ))}
        </select>
        {huidig && (
          <a href={huidig.url} target="_blank" rel="noopener noreferrer" className={KNOP_LICHT}>
            Bekijk pagina ↗
          </a>
        )}
      </div>
      <Melding fout={fout || lijst.fout} ok={ok} />
      {detail && (
        <div className="space-y-3">
          <div className={`${KAART} grid gap-3 sm:grid-cols-2`}>
            <label className="text-sm font-semibold">
              Paginatitel
              <input value={detail.titel} onChange={(e) => setDetail({ ...detail, titel: e.target.value })} className={`${VELD} mt-1`} />
            </label>
            <label className="text-sm font-semibold">
              Grote kop bovenaan
              <input value={detail.heroKop} onChange={(e) => setDetail({ ...detail, heroKop: e.target.value })} className={`${VELD} mt-1`} />
            </label>
          </div>
          {detail.blokken.map((b) => {
            if (b.soort === "vast") {
              return (
                <p key={`${versie}-${b.index}`} className="rounded-xl bg-schw-sand/60 px-4 py-2 text-sm text-schw-mute">
                  {b.omschrijving} <span className="text-xs">(niet via tekst te wijzigen)</span>
                </p>
              );
            }
            if (b.soort === "kop") {
              return (
                <label key={`${versie}-${b.index}`} className="block text-xs font-bold uppercase tracking-wide text-schw-mute">
                  Tussenkop
                  <input
                    defaultValue={b.tekst}
                    onChange={(e) => setWijzig({ ...wijzig, [b.index]: e.target.value })}
                    className={`${VELD} mt-1 font-display text-lg font-bold normal-case tracking-normal text-schw-night`}
                  />
                </label>
              );
            }
            if (b.soort === "alinea") {
              return (
                <label key={`${versie}-${b.index}`} className="block text-xs font-bold uppercase tracking-wide text-schw-mute">
                  Alinea{b.opmaak && <span className="ml-2 normal-case tracking-normal">(bevat vet of links; die vervallen als je deze alinea wijzigt)</span>}
                  <textarea
                    defaultValue={b.tekst}
                    rows={Math.min(10, Math.max(2, Math.ceil(b.tekst.length / 90)))}
                    onChange={(e) => setWijzig({ ...wijzig, [b.index]: e.target.value })}
                    className={`${VELD} mt-1 text-base normal-case tracking-normal`}
                  />
                </label>
              );
            }
            return (
              <label key={`${versie}-${b.index}`} className="block text-xs font-bold uppercase tracking-wide text-schw-mute">
                Lijst (één punt per regel)
                <textarea
                  defaultValue={b.regels.join("\n")}
                  rows={Math.min(12, b.regels.length + 1)}
                  onChange={(e) => setWijzig({ ...wijzig, [b.index]: e.target.value.split("\n") })}
                  className={`${VELD} mt-1 text-base normal-case tracking-normal`}
                />
              </label>
            );
          })}
          <div className="sticky bottom-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={bezig} onClick={() => void bewaar()} className={`${KNOP} shadow-lg`}>
              {bezig ? "Bezig…" : "Opslaan"}
            </button>
            {huidig?.bewerkt && (
              <button type="button" onClick={() => void terug()} className={`${KNOP_LICHT} shadow-lg`}>
                Terug naar origineel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
