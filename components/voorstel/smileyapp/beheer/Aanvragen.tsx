"use client";

import { useState } from "react";
import { STATUSSEN, STATUS_LABEL, telLink, voorkeurTekst, type Aanvraag, type Soort, type Status } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, Pil, VELD, foutTekst, moment, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// Demo-aanvragen of partner-aanmeldingen in het beheer: filter op status, per
// aanvraag bellen of mailen, de status bijhouden, een notitie maken en
// verwijderen. Na elke wijziging neemt de lijst de versie van de server over.

export const STATUS_KLEUR: Record<Status, string> = {
  nieuw: "bg-smiley-sun text-smiley-ink",
  gebeld: "bg-smiley-mint text-smiley-leaf",
  afspraak: "bg-smiley-green text-smiley-ink",
  klant: "bg-smiley-ink text-white",
  afgevallen: "bg-smiley-ink/10 text-smiley-mute",
};

type Filter = Status | "alle";

function AanvraagKaart({ a, pakketNamen, bijgewerkt, verwijderd }: { a: Aanvraag; pakketNamen: Record<string, string>; bijgewerkt: (a: Aanvraag) => void; verwijderd: (id: string) => void }) {
  const [notitie, setNotitie] = useState(a.notitie ?? "");
  const [bezig, setBezig] = useState(false);
  const [zeker, setZeker] = useState(false);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");

  async function wijzig(w: { status?: Status; notitie?: string }, klaar: string) {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      // de server kan meer veranderen dan wij sturen (wie, wanneer): zijn versie overnemen
      const { aanvraag } = await vraag<{ aanvraag: Aanvraag }>(BEHEER_API, { method: "PATCH", body: { id: a.id, ...w } });
      bijgewerkt(aanvraag);
      setNotitie(aanvraag.notitie ?? "");
      setOk(klaar);
    } catch (e) {
      setFout(foutTekst(e, "Opslaan lukte niet."));
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

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {pakket && (
          <div>
            <dt className="font-semibold text-smiley-mute">Pakket</dt>
            <dd className="font-semibold">{pakket}</dd>
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
        <div>
          <label htmlFor={`notitie-${a.id}`} className={LABEL}>
            Notitie (alleen voor het team)
          </label>
          <textarea id={`notitie-${a.id}`} rows={2} maxLength={2000} value={notitie} onChange={(e) => setNotitie(e.target.value)} className={`mt-1.5 ${VELD}`} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={bezig || notitie.trim() === (a.notitie ?? "")} onClick={() => void wijzig({ notitie }, "Notitie opgeslagen.")} className={KNOP_LICHT}>
              Notitie opslaan
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

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        {soort === "demo"
          ? "Wie op de website een demo aanvraagt, staat hier. Het gekozen moment is een voorkeur van de aanvrager, geen vaste afspraak."
          : "Wie zich op de website aanmeldt als partner, staat hier."}{" "}
        Een aanvraag verdwijnt vanzelf twaalf maanden na de laatste wijziging.
      </p>
      <div role="group" aria-label="Filter op status" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={filter === "alle"} onClick={() => setFilter("alle")} className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === "alle" ? "bg-smiley-ink text-white" : "bg-white ring-1 ring-smiley-ink/15"}`}>
          Alle ({eigen.length})
        </button>
        {STATUSSEN.map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === s ? "bg-smiley-ink text-white" : "bg-white ring-1 ring-smiley-ink/15"}`}>
            {STATUS_LABEL[s]} ({aantal(s)})
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
