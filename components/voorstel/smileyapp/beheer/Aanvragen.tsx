"use client";

import { useState } from "react";
import { NOTITIES_MAX, NOTITIE_TEKST_MAX, STATUSSEN, STATUS_LABEL, telLink, voorkeurTekst, type Aanvraag, type Soort, type Status } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { DEMO_MINUTEN, afspraakTekst } from "@/lib/voorstel/smileyapp-agenda-regels";
import { TAAL_NAAM } from "@/lib/voorstel/smileyapp-taal";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, Pil, VELD, foutTekst, moment, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// Demo-aanvragen of partner-aanmeldingen in het beheer, als opvolglijst: bovenaan
// de teller per status (tegelijk het filter), per aanvraag bellen of mailen, de
// status bijhouden, notities van het team (wie en wanneer) en verwijderen. Na
// elke wijziging neemt de lijst de versie van de server over.

// Eén kleur = één betekenis: geel wacht op jou, lichtgroen is opgepakt, blauw is gepland, groen is gedaan,
// donker is binnen (klant) en grijs is afgesloten zonder vervolg.
export const STATUS_KLEUR: Record<Status, string> = {
  nieuw: "bg-smiley-sun text-smiley-ink",
  gebeld: "bg-smiley-mint text-smiley-leaf",
  afspraak: "bg-sky-100 text-sky-900",
  gehad: "bg-smiley-green text-smiley-ink",
  klant: "bg-smiley-ink text-white",
  afgevallen: "bg-smiley-ink/10 text-smiley-mute",
};
/** Het bolletje in de teller: dezelfde kleur als het label van de status. */
const STATUS_BOL: Record<Status, string> = {
  nieuw: "bg-smiley-sun",
  gebeld: "bg-smiley-leaf",
  afspraak: "bg-sky-600",
  gehad: "bg-smiley-green",
  klant: "bg-smiley-ink",
  afgevallen: "bg-smiley-ink/30",
};

type Filter = Status | "alle";

function AanvraagKaart({ a, pakketNamen, bijgewerkt, verwijderd }: { a: Aanvraag; pakketNamen: Record<string, string>; bijgewerkt: (a: Aanvraag) => void; verwijderd: (id: string) => void }) {
  const [notitie, setNotitie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [zeker, setZeker] = useState(false);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");

  async function wijzig(w: { status?: Status; notitie?: string; nieuweNotitie?: string; wisNotitie?: string }, klaar: string): Promise<boolean> {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      // de server kan meer veranderen dan wij sturen (wie, wanneer): zijn versie overnemen
      const { aanvraag } = await vraag<{ aanvraag: Aanvraag }>(BEHEER_API, { method: "PATCH", body: { id: a.id, ...w } });
      bijgewerkt(aanvraag);
      setOk(klaar);
      return true;
    } catch (e) {
      setFout(foutTekst(e, "Opslaan lukte niet."));
      return false;
    } finally {
      setBezig(false);
    }
  }

  async function verwijder() {
    setBezig(true);
    setFout("");
    try {
      await vraag(BEHEER_API, { method: "DELETE", body: { id: a.id } });
      verwijderd(a.id);
    } catch (e) {
      setFout(foutTekst(e, "Verwijderen lukte niet."));
      setBezig(false);
    }
  }

  const pakket = a.pakket ? (pakketNamen[a.pakket] ?? a.pakket) : "";
  // de nieuwste notitie bovenaan
  const notities = [...(a.notities ?? [])].reverse();
  const vol = notities.length >= NOTITIES_MAX;
  return (
    <li className={KAART}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-display text-xl font-bold text-smiley-ink">{a.naam}</h3>
          <p className="break-words font-semibold text-smiley-mute">{a.bedrijf}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pil label={STATUS_LABEL[a.status]} kleur={STATUS_KLEUR[a.status]} />
          <span className="text-xs text-smiley-mute">binnen op {moment(a.aangemaakt)}</span>
        </div>
      </div>

      {a.afspraak && (
        <p className="mt-4 rounded-2xl bg-sky-100 p-4 text-sm font-semibold leading-relaxed text-sky-900">
          Demo gepland op {afspraakTekst(a.afspraak.start)} ({DEMO_MINUTEN} minuten, Nederlandse tijd). Annuleren kan bij Agenda.
        </p>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {pakket && (
          <div>
            <dt className="font-semibold text-smiley-mute">Pakket</dt>
            <dd className="font-semibold">{pakket}</dd>
          </div>
        )}
        {a.bron && (
          <div>
            <dt className="font-semibold text-smiley-mute">Bron</dt>
            <dd className="font-semibold">{a.bron}</dd>
          </div>
        )}
        {/* alleen als het formulier niet Nederlands was: dan weet het team in welke taal het moet bellen of mailen */}
        {a.taal && a.taal !== "nl" && (
          <div>
            <dt className="font-semibold text-smiley-mute">Taal</dt>
            <dd className="font-semibold">{TAAL_NAAM[a.taal]}</dd>
          </div>
        )}
        {a.interesses && a.interesses.length > 0 && (
          <div>
            <dt className="font-semibold text-smiley-mute">Interesse in</dt>
            <dd className="font-semibold">{a.interesses.join(", ")}</dd>
          </div>
        )}
        {a.voorkeur && (
          <div>
            <dt className="font-semibold text-smiley-mute">Wil gebeld worden op</dt>
            <dd className="font-semibold">{voorkeurTekst(a.voorkeur)}</dd>
          </div>
        )}
        {a.behandeldDoor && (
          <div>
            <dt className="font-semibold text-smiley-mute">Laatst bijgewerkt door</dt>
            <dd>
              {a.behandeldDoor}, {moment(a.gewijzigd)}
            </dd>
          </div>
        )}
      </dl>
      {a.bericht && <p className="mt-4 whitespace-pre-line break-words rounded-2xl bg-smiley-cream p-4 text-sm leading-relaxed">{a.bericht}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {a.telefoon && (
          <a href={telLink(a.telefoon)} className={KNOP}>
            Bel {a.telefoon}
          </a>
        )}
        <a href={`mailto:${a.email}`} className={`break-all ${KNOP_LICHT}`}>
          Mail {a.email}
        </a>
      </div>

      <div className="mt-5 grid gap-4 border-t border-smiley-ink/10 pt-5 sm:grid-cols-[220px_1fr]">
        <div>
          <label htmlFor={`status-${a.id}`} className={LABEL}>
            Status
          </label>
          <select id={`status-${a.id}`} value={a.status} disabled={bezig} onChange={(e) => void wijzig({ status: e.target.value as Status }, "Status opgeslagen.")} className={`mt-1.5 ${VELD}`}>
            {STATUSSEN.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`notitie-${a.id}`} className={LABEL}>
            Nieuwe notitie <span className="font-normal text-smiley-mute">(alleen voor het team)</span>
          </label>
          <textarea id={`notitie-${a.id}`} rows={2} maxLength={NOTITIE_TEKST_MAX} value={notitie} disabled={vol} onChange={(e) => setNotitie(e.target.value)} aria-describedby={`notitie-uitleg-${a.id}`} className={`mt-1.5 ${VELD}`} />
          <p id={`notitie-uitleg-${a.id}`} className="mt-1.5 text-sm text-smiley-mute">
            {vol ? `Er staan al ${NOTITIES_MAX} notities. Verwijder eerst een oude notitie.` : `Hooguit ${NOTITIE_TEKST_MAX} tekens; nu ${notitie.trim().length}. Je naam en het moment komen erbij.`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bezig || vol || notitie.trim() === ""}
              onClick={() =>
                void wijzig({ nieuweNotitie: notitie }, "Notitie toegevoegd.").then((gelukt) => {
                  if (gelukt) setNotitie("");
                })
              }
              className={KNOP_LICHT}
            >
              Notitie toevoegen
            </button>
            {zeker ? (
              <>
                <span className="text-sm font-semibold text-[#8E2A1E]">Deze aanvraag voorgoed verwijderen?</span>
                <button type="button" disabled={bezig} onClick={() => void verwijder()} className={KNOP_ROOD}>
                  Ja, verwijder
                </button>
                <button type="button" disabled={bezig} onClick={() => setZeker(false)} className={KNOP_LICHT}>
                  Nee
                </button>
              </>
            ) : (
              <button type="button" disabled={bezig} onClick={() => setZeker(true)} className={`ml-auto ${KNOP_ROOD}`}>
                Verwijderen
              </button>
            )}
          </div>
        </div>
      </div>

      {(notities.length > 0 || a.notitie) && (
        <ul aria-label={`Notities bij ${a.naam}`} className="mt-4 space-y-2">
          {notities.map((n) => (
            <li key={n.id} className="rounded-2xl bg-smiley-cream p-4 text-sm">
              <p className="whitespace-pre-line break-words leading-relaxed text-smiley-ink">{n.tekst}</p>
              <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-smiley-mute">
                <span>
                  {n.door}, {moment(n.op)}
                </span>
                <button type="button" disabled={bezig} onClick={() => void wijzig({ wisNotitie: n.id }, "Notitie verwijderd.")} className="relative font-semibold text-[#8E2A1E] underline underline-offset-2 disabled:opacity-50">
                  Verwijder<span className="sr-only"> de notitie van {n.door}</span>
                </button>
              </p>
            </li>
          ))}
          {/* de ene notitie van vóór de notitielijst: nog te lezen en weg te halen */}
          {a.notitie && (
            <li className="rounded-2xl bg-smiley-cream p-4 text-sm">
              <p className="whitespace-pre-line break-words leading-relaxed text-smiley-ink">{a.notitie}</p>
              <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-smiley-mute">
                <span>Eerdere notitie</span>
                <button type="button" disabled={bezig} onClick={() => void wijzig({ notitie: "" }, "Notitie verwijderd.")} className="relative font-semibold text-[#8E2A1E] underline underline-offset-2 disabled:opacity-50">
                  Verwijder<span className="sr-only"> de eerdere notitie</span>
                </button>
              </p>
            </li>
          )}
        </ul>
      )}
      <div className="mt-3 empty:hidden">
        <Melding fout={fout} ok={ok} />
      </div>
    </li>
  );
}

export function Aanvragen({
  soort,
  lijst,
  pakketNamen,
  bijgewerkt,
  verwijderd,
}: {
  soort: Soort;
  lijst: readonly Aanvraag[];
  pakketNamen: Record<string, string>;
  bijgewerkt: (a: Aanvraag) => void;
  verwijderd: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("alle");
  const eigen = lijst.filter((a) => a.soort === soort);
  const zichtbaar = filter === "alle" ? eigen : eigen.filter((a) => a.status === filter);
  const aantal = (s: Status) => eigen.filter((a) => a.status === s).length;
  const wat = soort === "demo" ? "demo-aanvragen" : "partner-aanmeldingen";
  const TEGEL = "flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-colors";

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        {soort === "demo"
          ? "Wie op de website een demo aanvraagt, staat hier. Een voorkeursmoment is een wens van de aanvrager; een tijd uit de agenda is een vaste afspraak."
          : "Wie zich op de website aanmeldt als partner, staat hier."}{" "}
        Een aanvraag verdwijnt vanzelf twaalf maanden na de laatste wijziging.
      </p>
      {/* de teller per status, tegelijk het filter; op de telefoon twee naast elkaar, zonder zijwaarts vegen */}
      <div role="group" aria-label="Aantal per status, tik om te filteren" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <button type="button" aria-pressed={filter === "alle"} onClick={() => setFilter("alle")} className={`${TEGEL} ${filter === "alle" ? "bg-smiley-ink text-white" : "bg-white text-smiley-ink ring-1 ring-smiley-ink/15"}`}>
          <span className="font-display text-xl font-bold leading-none">{eigen.length}</span>
          <span className="min-w-0 break-words">Alle</span>
        </button>
        {STATUSSEN.map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`${TEGEL} ${filter === s ? "bg-smiley-ink text-white" : "bg-white text-smiley-ink ring-1 ring-smiley-ink/15"}`}>
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_BOL[s]} ${filter === s ? "ring-2 ring-white" : ""}`} />
            <span className="font-display text-xl font-bold leading-none">{aantal(s)}</span>
            <span className="min-w-0 break-words">{STATUS_LABEL[s]}</span>
          </button>
        ))}
      </div>
      {zichtbaar.length === 0 ? (
        <p className={`${KAART} text-smiley-mute`}>{eigen.length === 0 ? `Er zijn nog geen ${wat}.` : `Geen ${wat} met deze status.`}</p>
      ) : (
        <ul className="space-y-4">
          {zichtbaar.map((a) => (
            <AanvraagKaart key={a.id} a={a} pakketNamen={pakketNamen} bijgewerkt={bijgewerkt} verwijderd={verwijderd} />
          ))}
        </ul>
      )}
    </div>
  );
}
