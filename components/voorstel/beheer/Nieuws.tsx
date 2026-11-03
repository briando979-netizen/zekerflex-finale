"use client";

import { useState } from "react";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, Melding, Pil, VELD, dagNaam, useBeheerData, vraag } from "@/components/voorstel/beheer/api";
import { BASE } from "@/lib/voorstel/schwarzwald";
import { NIEUWS_FOTOS, zichtbaar } from "@/lib/voorstel/nieuws-regels";

// Nieuwsberichten schrijven, inplannen (latere datum) of als concept bewaren.
// Platte tekst; een lege regel begint een nieuwe alinea. Foto uit hun eigen set.

interface Bericht {
  id: string;
  slug: string;
  titel: string;
  datum: string;
  samenvatting: string;
  tekst: string;
  foto: string;
  gepubliceerd: boolean;
}
type Invoer = Omit<Bericht, "id" | "slug"> & { id?: string };

const URL_NW = `${BEHEER_API}/nieuws`;
const LEEG = (vandaag: string): Invoer => ({ titel: "", datum: vandaag, samenvatting: "", tekst: "", foto: "", gepubliceerd: true });

function status(b: Bericht, vandaag: string): [string, string] {
  if (!b.gepubliceerd) return ["Concept", "bg-schw-sand text-schw-mute"];
  if (!zichtbaar(b, vandaag)) return ["Ingepland", "bg-[#E0E7FF] text-[#3730A3]"];
  return ["Online", "bg-[#DCFCE7] text-[#15803D]"];
}

export function Nieuws({ vandaag }: { vandaag: string }) {
  const { data, setData, fout, setFout } = useBeheerData<{ berichten: Bericht[] }>(URL_NW);
  const [invoer, setInvoer] = useState<Invoer>(LEEG(vandaag));
  const [ok, setOk] = useState("");
  const [bezig, setBezig] = useState(false);

  async function bewaar() {
    setBezig(true);
    setOk("");
    setFout("");
    try {
      const { bericht } = await vraag<{ bericht: Bericht }>(URL_NW, { method: "POST", body: invoer });
      setData((d) => ({ berichten: [bericht, ...(d?.berichten ?? []).filter((x) => x.id !== bericht.id)].sort((a, b) => b.datum.localeCompare(a.datum)) }));
      setInvoer({ ...invoer, id: bericht.id });
      setOk(status(bericht, vandaag)[0] === "Online" ? "Opgeslagen en online." : status(bericht, vandaag)[0] === "Ingepland" ? "Opgeslagen; komt online op de gekozen datum." : "Opgeslagen als concept.");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  }
  async function verwijder(b: Bericht) {
    if (!window.confirm(`"${b.titel}" verwijderen?`)) return;
    try {
      await vraag(URL_NW, { method: "DELETE", body: { id: b.id } });
      setData((d) => (d ? { berichten: d.berichten.filter((x) => x.id !== b.id) } : d));
      if (invoer.id === b.id) setInvoer(LEEG(vandaag));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  const berichten = data?.berichten ?? [];
  const bewerkt = berichten.find((b) => b.id === invoer.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <section className={KAART}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">Berichten</h3>
          <button type="button" onClick={() => setInvoer(LEEG(vandaag))} className={KNOP_LICHT}>
            Nieuw bericht
          </button>
        </div>
        {data && berichten.length === 0 && <p className="mt-4 text-sm text-schw-mute">Nog geen berichten. Je eerste bericht staat meteen op /nieuws.</p>}
        <ul className="mt-4 space-y-2">
          {berichten.map((b) => {
            const [label, kleur] = status(b, vandaag);
            return (
              <li key={b.id} className={`rounded-xl px-3 py-2 ${invoer.id === b.id ? "bg-schw-sun/40" : "bg-schw-cream"}`}>
                <button type="button" onClick={() => setInvoer({ id: b.id, titel: b.titel, datum: b.datum, samenvatting: b.samenvatting, tekst: b.tekst, foto: b.foto, gepubliceerd: b.gepubliceerd })} className="w-full text-left">
                  <span className="block font-semibold">{b.titel}</span>
                  <span className="text-xs text-schw-mute">
                    {dagNaam(b.datum, { day: "numeric", month: "short", year: "numeric" })} <Pil label={label} kleur={kleur} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={KAART} aria-label={invoer.id ? "Bericht bewerken" : "Nieuw bericht"}>
        <h3 className="font-display text-lg font-bold">{invoer.id ? "Bericht bewerken" : "Nieuw bericht"}</h3>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-semibold">
            Titel
            <input value={invoer.titel} maxLength={120} onChange={(e) => setInvoer({ ...invoer, titel: e.target.value })} className={`${VELD} mt-1`} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Datum (later = ingepland)
              <input type="date" value={invoer.datum} onChange={(e) => setInvoer({ ...invoer, datum: e.target.value })} className={`${VELD} mt-1`} />
            </label>
            <label className="block text-sm font-semibold">
              Foto
              <select value={invoer.foto} onChange={(e) => setInvoer({ ...invoer, foto: e.target.value })} className={`${VELD} mt-1`}>
                <option value="">Geen foto</option>
                {NIEUWS_FOTOS.map((f) => (
                  <option key={f.pad} value={f.pad}>
                    {f.naam}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Samenvatting (op het overzicht, mag leeg)
            <input value={invoer.samenvatting} maxLength={300} onChange={(e) => setInvoer({ ...invoer, samenvatting: e.target.value })} className={`${VELD} mt-1`} />
          </label>
          <label className="block text-sm font-semibold">
            Tekst (een lege regel = nieuwe alinea)
            <textarea rows={10} value={invoer.tekst} maxLength={10000} onChange={(e) => setInvoer({ ...invoer, tekst: e.target.value })} className={`${VELD} mt-1`} />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={invoer.gepubliceerd} onChange={(e) => setInvoer({ ...invoer, gepubliceerd: e.target.checked })} className="h-4 w-4 accent-[#FF5F1F]" />
            Publiceren (uit = concept)
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" disabled={bezig} onClick={() => void bewaar()} className={KNOP}>
            {bezig ? "Bezig…" : "Opslaan"}
          </button>
          {bewerkt && status(bewerkt, vandaag)[0] === "Online" && (
            <a href={`${BASE}/nieuws/${bewerkt.slug}`} target="_blank" rel="noopener" className="text-sm font-semibold underline">
              Bekijk op de site
            </a>
          )}
          {bewerkt && (
            <button type="button" onClick={() => void verwijder(bewerkt)} className="ml-auto text-sm font-semibold text-[#B91C1C]">
              Verwijderen
            </button>
          )}
        </div>
        <div className="mt-3">
          <Melding fout={fout} ok={ok} />
        </div>
      </section>
    </div>
  );
}
