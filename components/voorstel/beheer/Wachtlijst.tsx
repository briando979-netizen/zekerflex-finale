"use client";

import { BEHEER_API, KAART, KNOP_LICHT, Melding, Pil, dagNaam, useBeheerData, vraag } from "@/components/voorstel/beheer/api";

// Wachtlijst voor volle tijdsloten. Er gaat geen mail uit: hier ziet het team
// live of er weer plek is (bijv. na een annulering) en belt de gast. Voorbije
// datums vallen vanzelf weg.

interface Wachtplek {
  id: string;
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
  aangemaakt: string;
  plekVrij: boolean;
}

const URL_WL = `${BEHEER_API}/wachtlijst`;

export function Wachtlijst({ namen, openKlant }: { namen: Record<string, string>; openKlant: (email: string) => void }) {
  const { data, setData, fout, setFout, laad } = useBeheerData<{ wachtlijst: Wachtplek[] }>(URL_WL);
  const lijst = data?.wachtlijst ?? [];
  const vrij = lijst.filter((w) => w.plekVrij).length;

  async function haalWeg(w: Wachtplek) {
    if (!window.confirm(`${w.naam} van de wachtlijst halen?`)) return;
    try {
      await vraag(URL_WL, { method: "DELETE", body: { id: w.id } });
      setData((d) => (d ? { wachtlijst: d.wachtlijst.filter((x) => x.id !== w.id) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-schw-mute">
          Gasten die zich aanmeldden voor een vol tijdslot. Staat er <strong>Plek vrij</strong>, dan is er inmiddels ruimte: bel of mail de gast, of boek hem in onder Reserveringen.
        </p>
        <button type="button" onClick={() => void laad()} className={KNOP_LICHT}>
          Vernieuwen
        </button>
      </div>
      {data && (
        <p className="font-semibold">
          {lijst.length} op de wachtlijst{vrij > 0 && <> · <span className="text-[#15803D]">{vrij} met plek vrij</span></>}
        </p>
      )}
      <Melding fout={fout} />
      {data && lijst.length === 0 && <p className="text-schw-mute">Niemand op de wachtlijst.</p>}
      <ul className="space-y-3">
        {lijst.map((w) => (
          <li key={w.id} className={`${KAART} ${w.plekVrij ? "ring-2 ring-[#15803D]" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold">
                  {namen[w.activiteit] ?? w.activiteit} · {w.personen} personen{" "}
                  {w.plekVrij ? <Pil label="Plek vrij" kleur="bg-[#DCFCE7] text-[#15803D]" /> : <Pil label="Nog vol" kleur="bg-schw-sand text-schw-mute" />}
                </p>
                <p className="text-sm text-schw-mute first-letter:uppercase">
                  {dagNaam(w.datum)} om {w.tijd} · aangemeld {dagNaam(w.aangemaakt.slice(0, 10), { day: "numeric", month: "short" })}
                </p>
                <p className="mt-1 text-sm">
                  {w.naam} ·{" "}
                  <a href={`tel:${w.telefoon}`} className="underline">
                    {w.telefoon}
                  </a>{" "}
                  ·{" "}
                  <a href={`mailto:${w.email}?subject=${encodeURIComponent(`Er is plek: ${namen[w.activiteit] ?? w.activiteit} op ${w.datum} om ${w.tijd}`)}`} className="underline">
                    {w.email}
                  </a>{" "}
                  ·{" "}
                  <button type="button" onClick={() => openKlant(w.email)} className="underline">
                    klantdossier
                  </button>
                </p>
              </div>
              <button type="button" onClick={() => void haalWeg(w)} className={`${KNOP_LICHT} text-[#B91C1C]`}>
                Van de wachtlijst
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
