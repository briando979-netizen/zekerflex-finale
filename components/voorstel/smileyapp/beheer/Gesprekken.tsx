"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, LABEL, Melding, Pil, VELD, foutTekst, moment, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// De websitechat in het beheer: de gesprekken van de AI-assistent op de site.
// Meelezen, als medewerker antwoorden (de assistent zwijgt dan), teruggeven en
// sluiten. Lijst en gesprek verversen vanzelf, alleen zolang het tabblad in
// beeld is. Scrollen volgt het laatste bericht (het aantal), niet de lijst zelf:
// elke verversing maakt een nieuwe lijst en anders sprong het gesprek steeds
// naar beneden terwijl je terugleest.

type Status = "ai" | "wacht" | "mens" | "gesloten";
interface Rij {
  id: string;
  status: Status;
  laatst: string;
  ongelezen: number;
  aantal: number;
  pagina: string;
  voorbeeld: string;
}
interface Bericht {
  rol: "gast" | "ai" | "medewerker" | "systeem";
  tekst: string;
  op: string;
  door?: string;
}
interface Gesprek {
  id: string;
  status: Status;
  berichten: Bericht[];
  pagina?: string;
}

const URL_CHAT = `${BEHEER_API}/chat`;
const LIJST_MS = 15_000;
const GESPREK_MS = 6_000;
const STATUS: Record<Status, [string, string]> = {
  wacht: ["Wacht op een medewerker", "bg-smiley-sun text-smiley-ink"],
  mens: ["Medewerker", "bg-smiley-green text-smiley-ink"],
  ai: ["AI-assistent", "bg-smiley-mint text-smiley-leaf"],
  gesloten: ["Gesloten", "bg-smiley-ink/10 text-smiley-mute"],
};
const FILTERS = [
  ["open", "Open"],
  ["wacht", "Wacht op een medewerker"],
  ["alle", "Alle"],
] as const;
type Filter = (typeof FILTERS)[number][0];

export function Gesprekken({ bijgewerkt }: { bijgewerkt: () => void }) {
  const [rijen, setRijen] = useState<Rij[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [gekozen, setGekozen] = useState("");
  const [gesprek, setGesprek] = useState<Gesprek | null>(null);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const laadLijst = useCallback(async () => {
    try {
      setRijen((await vraag<{ gesprekken: Rij[] }>(URL_CHAT)).gesprekken);
    } catch (e) {
      setFout(foutTekst(e, "Laden lukte niet."));
    }
  }, []);

  const laadGesprek = useCallback(async (id: string) => {
    try {
      setGesprek((await vraag<{ gesprek: Gesprek }>(`${URL_CHAT}?id=${encodeURIComponent(id)}`)).gesprek);
    } catch (e) {
      setFout(foutTekst(e, "Laden lukte niet."));
    }
  }, []);

  useEffect(() => {
    void laadLijst();
    const t = setInterval(() => {
      if (!document.hidden) void laadLijst();
    }, LIJST_MS);
    return () => clearInterval(t);
  }, [laadLijst]);

  useEffect(() => {
    if (!gekozen) return;
    void laadGesprek(gekozen);
    const t = setInterval(() => {
      if (!document.hidden) void laadGesprek(gekozen);
    }, GESPREK_MS);
    return () => clearInterval(t);
  }, [gekozen, laadGesprek]);

  // scrollen: onderaan blijven als je onderaan was, en bij een ander gesprek naar het eind
  const logRef = useRef<HTMLDivElement | null>(null);
  const onderaan = useRef(true);
  const vorigId = useRef("");
  const gesprekId = gesprek?.id ?? "";
  const aantal = gesprek?.berichten.length ?? 0;
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (vorigId.current !== gesprekId || onderaan.current) el.scrollTop = el.scrollHeight;
    vorigId.current = gesprekId;
  }, [gesprekId, aantal]);

  async function doe(body: { actie: string; tekst?: string }): Promise<boolean> {
    if (!gesprek) return false;
    setBezig(true);
    try {
      const d = await vraag<{ gesprek: Gesprek }>(URL_CHAT, { method: "POST", body: { id: gesprek.id, ...body } });
      onderaan.current = true;
      setGesprek(d.gesprek);
      setFout("");
      void laadLijst();
      bijgewerkt();
      return true;
    } catch (e) {
      setFout(foutTekst(e, "Dat lukte niet."));
      return false;
    } finally {
      setBezig(false);
    }
  }

  async function antwoord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tekst.trim()) return;
    if (await doe({ actie: "antwoord", tekst })) setTekst("");
  }

  const alle = rijen ?? [];
  const lijst = alle.filter((g) => (filter === "wacht" ? g.status === "wacht" : filter === "open" ? g.status !== "gesloten" : true));
  const wachtend = alle.filter((g) => g.status === "wacht").length;

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        De AI-assistent beantwoordt vragen op de website met de teksten van de site. Je kunt meelezen en een gesprek overnemen; zolang jij het hebt, zwijgt de assistent. Gesprekken verdwijnen vanzelf na 90 dagen.
      </p>
      <Melding fout={fout} />
      <div role="group" aria-label="Filter gesprekken" className="flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === k ? "bg-smiley-ink text-white" : "bg-white ring-1 ring-smiley-ink/15"}`}>
            {label}
            {k === "wacht" && wachtend > 0 ? ` (${wachtend})` : ""}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <ul aria-label="Gesprekken" className="space-y-2">
          {rijen === null && <li className="text-sm text-smiley-mute">Laden…</li>}
          {rijen !== null && lijst.length === 0 && <li className="text-sm text-smiley-mute">Geen gesprekken in deze lijst.</li>}
          {lijst.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                aria-pressed={gekozen === g.id}
                onClick={() => {
                  onderaan.current = true;
                  setGekozen(g.id);
                }}
                className={`block w-full rounded-2xl bg-white p-4 text-left ring-1 ${gekozen === g.id ? "ring-2 ring-smiley-leaf" : g.status === "wacht" ? "ring-2 ring-smiley-sun" : "ring-smiley-ink/5"}`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <Pil label={STATUS[g.status][0]} kleur={STATUS[g.status][1]} />
                  {g.ongelezen > 0 && <Pil label={`${g.ongelezen} nieuw`} kleur="bg-smiley-coral text-smiley-ink" />}
                  <span className="ml-auto text-xs text-smiley-mute">{moment(g.laatst)}</span>
                </span>
                <span className="mt-2 line-clamp-2 block break-words text-sm">{g.voorbeeld || "(nog geen vraag)"}</span>
                <span className="mt-1 block text-xs text-smiley-mute">
                  {g.aantal} berichten{g.pagina ? ` · gestart op ${g.pagina}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <section aria-label="Gesprek" className={`${KAART} min-h-[22rem]`}>
          {!gesprek ? (
            <p className="text-smiley-mute">Kies een gesprek om mee te lezen.</p>
          ) : (
            <div className="flex h-full flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pil label={STATUS[gesprek.status][0]} kleur={STATUS[gesprek.status][1]} />
                {gesprek.pagina && <span className="break-all text-xs text-smiley-mute">gestart op {gesprek.pagina}</span>}
                <div className="ml-auto flex flex-wrap gap-2">
                  {gesprek.status !== "mens" && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "overnemen" })} className={KNOP}>
                      Overnemen
                    </button>
                  )}
                  {gesprek.status === "mens" && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "teruggeven" })} className={KNOP_LICHT}>
                      Teruggeven aan de assistent
                    </button>
                  )}
                  {gesprek.status !== "gesloten" && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "sluiten" })} className={KNOP_LICHT}>
                      Sluiten
                    </button>
                  )}
                </div>
              </div>
              <div
                ref={logRef}
                role="log"
                aria-label="Berichten"
                tabIndex={0}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  onderaan.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
                className="max-h-[26rem] flex-1 space-y-3 overflow-y-auto rounded-2xl bg-smiley-cream p-4"
              >
                {gesprek.berichten.map((b, i) =>
                  b.rol === "systeem" ? (
                    <p key={i} className="text-center text-xs text-smiley-mute">
                      {b.tekst}
                    </p>
                  ) : (
                    <div key={i} className={b.rol === "gast" ? "mr-auto max-w-[85%]" : "ml-auto max-w-[85%]"}>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-smiley-mute">
                        {b.rol === "gast" ? "Bezoeker" : b.rol === "ai" ? "AI-assistent" : (b.door ?? "Medewerker")} · {moment(b.op)}
                      </p>
                      <p className={`whitespace-pre-line break-words rounded-2xl px-4 py-2.5 text-sm ${b.rol === "gast" ? "bg-white ring-1 ring-smiley-ink/10" : b.rol === "ai" ? "bg-smiley-mint" : "bg-smiley-ink text-white"}`}>{b.tekst}</p>
                    </div>
                  ),
                )}
              </div>
              <form onSubmit={(e) => void antwoord(e)} className="space-y-2">
                <label htmlFor="sm-chat-antwoord" className={LABEL}>
                  Antwoord als medewerker
                </label>
                <textarea id="sm-chat-antwoord" value={tekst} onChange={(e) => setTekst(e.target.value)} rows={3} maxLength={2000} className={VELD} />
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={bezig || !tekst.trim()} className={KNOP}>
                    Verstuur
                  </button>
                  <p className="text-xs text-smiley-mute">Met een antwoord neem je het gesprek over; de assistent zwijgt tot je het teruggeeft.</p>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
