"use client";

import { useCallback, useEffect, useState } from "react";
import { looptijdTekst, prijsTekst, type Pakket, type PakketId } from "@/lib/voorstel/smileyapp";
import { LABEL_TEKENS, LOOPTIJD_MAX, LOOPTIJD_MIN, ONDERDEEL_TEKENS, ONDERDELEN_MAX, alsInvoer, type PakketInvoer } from "@/lib/voorstel/smileyapp-pakket-regels";
import { ApiFout, BEHEER_API, KAART, KNOP, KNOP_LICHT, LABEL, Melding, Pil, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// "Pakketten" in het beheer: per pakket de prijs per maand (leeg = op
// aanvraag), de minimale looptijd, het label en de onderdelen aanpassen. Wat
// je hier bewaart, staat meteen op de site, in de veelgestelde vragen, in de
// pakketkiezer en in de chat: die lezen allemaal dezelfde pakketten. De
// standaard van smileyapp.nl blijft bewaard: "Terug naar de standaard" zet
// hem terug. De naam en de uitleg van een pakket staan vast.

const URL_INHOUD = `${BEHEER_API}/inhoud`;

interface Gegevens {
  pakketten: Pakket[];
  standaard: Pakket[];
  aangepast: PakketId[];
}

function PakketKaart({ p, standaard, aangepast, bezig, doe }: { p: Pakket; standaard: Pakket | undefined; aangepast: boolean; bezig: boolean; doe: (body: Record<string, unknown>, klaar: string) => Promise<string> }) {
  const [v, setV] = useState<PakketInvoer>(alsInvoer(p));
  const [fout, setFout] = useState("");
  const zet = (veld: keyof PakketInvoer, waarde: string) => setV((x) => ({ ...x, [veld]: waarde }));
  const id = `sm-pakket-${p.id}`;

  async function bewaar() {
    setFout(await doe({ actie: "pakket-bewaren", pakket: p.id, ...v }, `${p.naam} bewaard. De site toont de nieuwe gegevens.`));
  }

  return (
    <li className={KAART}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-display text-xl font-bold text-smiley-ink">{p.naam}</h3>
          <p className="text-sm text-smiley-mute">
            Nu op de site: {prijsTekst(p)}
            {p.prijs !== null ? " maandelijks" : ""}
            {looptijdTekst(p) ? ` · ${looptijdTekst(p).toLowerCase()}` : ""}
          </p>
        </div>
        <Pil label={aangepast ? "Aangepast" : "Standaard"} kleur={aangepast ? "bg-smiley-sun text-smiley-ink" : "bg-smiley-mint text-smiley-leaf"} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-prijs`} className={LABEL}>
            Prijs per maand
          </label>
          <input id={`${id}-prijs`} type="text" inputMode="decimal" maxLength={12} value={v.prijs} onChange={(e) => zet("prijs", e.target.value)} aria-describedby={`${id}-prijs-uitleg`} className={`mt-1.5 ${VELD}`} />
          <p id={`${id}-prijs-uitleg`} className="mt-1.5 text-xs text-smiley-mute">
            In euro, met hooguit twee decimalen. Leeg = op aanvraag.
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-looptijd`} className={LABEL}>
            Minimale looptijd
          </label>
          <input id={`${id}-looptijd`} type="text" inputMode="numeric" maxLength={2} value={v.looptijd} onChange={(e) => zet("looptijd", e.target.value)} aria-describedby={`${id}-looptijd-uitleg`} className={`mt-1.5 ${VELD}`} />
          <p id={`${id}-looptijd-uitleg`} className="mt-1.5 text-xs text-smiley-mute">
            In maanden, {LOOPTIJD_MIN} tot {LOOPTIJD_MAX}. Leeg = geen.
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-label`} className={LABEL}>
            Label
          </label>
          <input id={`${id}-label`} type="text" maxLength={LABEL_TEKENS} value={v.label} onChange={(e) => zet("label", e.target.value)} className={`mt-1.5 ${VELD}`} />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor={`${id}-onderdelen`} className={LABEL}>
            Onderdelen
          </label>
          <textarea id={`${id}-onderdelen`} rows={Math.min(12, Math.max(4, v.onderdelen.split("\n").length + 1))} value={v.onderdelen} onChange={(e) => zet("onderdelen", e.target.value)} aria-describedby={`${id}-onderdelen-uitleg`} className={`mt-1.5 ${VELD}`} />
          <p id={`${id}-onderdelen-uitleg`} className="mt-1.5 text-xs leading-relaxed text-smiley-mute">
            Eén onderdeel per regel, hooguit {ONDERDELEN_MAX} regels van elk hooguit {ONDERDEEL_TEKENS} tekens. De pakketkiezer leest de aantallen uit regels als &ldquo;10 vragenlijsten&rdquo;, &ldquo;100 beoordelingen&rdquo; en &ldquo;Meerdere gebruikers&rdquo;.
          </p>
        </div>
      </div>
      {fout && (
        <p role="alert" className="mt-4 rounded-2xl bg-smiley-coral/15 p-3 text-sm font-semibold text-[#8E2A1E]">
          {fout}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-smiley-ink/10 pt-4">
        <button type="button" disabled={bezig} onClick={() => void bewaar()} className={KNOP}>
          Bewaar<span className="sr-only"> het {p.naam}</span>
        </button>
        {aangepast && standaard && (
          <button
            type="button"
            disabled={bezig}
            onClick={() =>
              void doe({ actie: "pakket-standaard", pakket: p.id }, `${p.naam} staat weer op de standaard.`).then((f) => {
                setFout(f);
                if (!f) setV(alsInvoer(standaard));
              })
            }
            className={KNOP_LICHT}
          >
            Terug naar de standaard<span className="sr-only"> voor het {p.naam}</span>
          </button>
        )}
      </div>
    </li>
  );
}

export function PakkettenBeheer() {
  const [data, setData] = useState<Gegevens | null>(null);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [bezig, setBezig] = useState(false);
  /** gaat omhoog als alles terug naar de standaard gaat: de kaarten beginnen dan opnieuw met de standaardwaarden */
  const [ronde, setRonde] = useState(0);

  const laad = useCallback(async () => {
    try {
      setData(await vraag<Gegevens>(`${URL_INHOUD}?deel=pakketten`));
    } catch (e) {
      setFout(foutTekst(e, "De pakketten laden lukte niet."));
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  /** Eén wijziging; neemt de serverversie over. Geeft de foutmelding terug (leeg = gelukt), voor bij het pakket zelf. */
  const doe = useCallback(async (body: Record<string, unknown>, klaar: string): Promise<string> => {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      setData(await vraag<Gegevens>(URL_INHOUD, { method: "POST", body }));
      setOk(klaar);
      return "";
    } catch (e) {
      // een fout in een veld (422) hoort bij het pakket; de rest bovenaan
      const tekst = foutTekst(e, "Dat lukte niet.");
      if (e instanceof ApiFout && e.status === 422) return tekst;
      setFout(tekst);
      return "";
    } finally {
      setBezig(false);
    }
  }, []);

  if (!data) return fout ? <Melding fout={fout} /> : <p className="text-sm text-smiley-mute">Laden…</p>;

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        Wat je hier bewaart, staat meteen op de site: op de prijskaarten, in de veelgestelde vragen, in de pakketkiezer en in de antwoorden van de chat.
      </p>
      <Melding fout={fout} ok={ok} />
      <ul className="space-y-4">
        {data.pakketten.map((p) => (
          <PakketKaart key={`${p.id}-${ronde}`} p={p} standaard={data.standaard.find((s) => s.id === p.id)} aangepast={data.aangepast.includes(p.id)} bezig={bezig} doe={doe} />
        ))}
      </ul>
      {data.aangepast.length > 0 && (
        <button
          type="button"
          disabled={bezig}
          onClick={() =>
            void doe({ actie: "pakket-standaard" }, "Alle pakketten staan weer op de standaard.").then(() => setRonde((r) => r + 1))
          }
          className={KNOP_LICHT}
        >
          Alle pakketten terug naar de standaard
        </button>
      )}
    </div>
  );
}
