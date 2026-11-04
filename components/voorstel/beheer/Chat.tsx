"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, Melding, Pil, VELD, useBeheerData, vraag } from "@/components/voorstel/beheer/api";

// Websitechat in het beheer: meelezen terwijl de assistent antwoordt,
// overnemen (de assistent zwijgt dan), zelf antwoorden, teruggeven, sluiten
// en toewijzen aan iemand van het team. Lijst en gesprek verversen vanzelf.

type Status = "ai" | "wacht" | "mens" | "gesloten";
interface Rij {
  id: string;
  status: Status;
  laatst: string;
  ongelezen: number;
  aantal: number;
  toegewezen: string;
  account: string;
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
  toegewezen?: string;
  account?: string;
  pagina?: string;
}
interface Lijst {
  ik: string;
  team: { email: string; naam: string }[];
  gesprekken: Rij[];
}

const URL_CHAT = `${BEHEER_API}/chat`;
const STATUS: Record<Status, [string, string]> = {
  wacht: ["Wacht op medewerker", "bg-schw-sun text-schw-night"],
  mens: ["Medewerker", "bg-[#E0E7FF] text-[#3730A3]"],
  ai: ["Assistent", "bg-schw-sand text-schw-night"],
  gesloten: ["Gesloten", "bg-schw-sand text-schw-mute"],
};
const FILTERS = [
  ["wacht", "Wacht op medewerker"],
  ["mijn", "Mijn gesprekken"],
  ["open", "Open"],
  ["alle", "Alle"],
] as const;
type Filter = (typeof FILTERS)[number][0];

const tijd = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

export function Chat({ openKlant }: { openKlant: (email: string) => void }) {
  const { data, fout, setFout, laad } = useBeheerData<Lijst>(URL_CHAT);
  const [filter, setFilter] = useState<Filter>("open");
  const [gekozen, setGekozen] = useState("");
  const [gesprek, setGesprek] = useState<Gesprek | null>(null);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);

  // lijst verversen
  useEffect(() => {
    const t = setInterval(() => void laad(), 8000);
    return () => clearInterval(t);
  }, [laad]);

  const laadGesprek = useCallback(async (id: string) => {
    try {
      setGesprek((await vraag<{ gesprek: Gesprek }>(`${URL_CHAT}?id=${encodeURIComponent(id)}`)).gesprek);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, [setFout]);

  useEffect(() => {
    if (!gekozen) return;
    void laadGesprek(gekozen);
    const t = setInterval(() => void laadGesprek(gekozen), 5000);
    return () => clearInterval(t);
  }, [gekozen, laadGesprek]);

  async function doe(body: Record<string, string>) {
    if (!gesprek) return;
    setBezig(true);
    try {
      const d = await vraag<{ gesprek: Gesprek }>(URL_CHAT, { method: "POST", body: { id: gesprek.id, ...body } });
      setGesprek(d.gesprek);
      setFout("");
      void laad();
      return true;
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
      return false;
    } finally {
      setBezig(false);
    }
  }

  async function antwoord(e: FormEvent) {
    e.preventDefault();
    if (!tekst.trim()) return;
    if (await doe({ actie: "antwoord", tekst })) setTekst("");
  }

  const alle = data?.gesprekken ?? [];
  const lijst = alle.filter((g) =>
    filter === "wacht" ? g.status === "wacht" : filter === "mijn" ? !!data?.ik && g.toegewezen === data.ik : filter === "open" ? g.status !== "gesloten" : true,
  );
  const wachtend = alle.filter((g) => g.status === "wacht").length;
  const naamVan = (email: string) => data?.team.find((t) => t.email === email)?.naam ?? email;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto max-w-2xl text-sm text-schw-mute">
          De assistent beantwoordt vragen op de website met jullie eigen gegevens. Je kunt meelezen en elk gesprek overnemen; zolang jij het hebt, zwijgt de assistent. Gesprekken vervallen na 90 dagen.
        </p>
        <button type="button" onClick={() => void laad()} className={KNOP_LICHT}>
          Vernieuwen
        </button>
      </div>
      <Melding fout={fout} />
      <div role="group" aria-label="Filter gesprekken" className="flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === k ? "bg-schw-night text-schw-cream" : "bg-white ring-1 ring-schw-night/15"}`}>
            {label}
            {k === "wacht" && wachtend > 0 ? ` (${wachtend})` : ""}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <ul aria-label="Gesprekken" className="space-y-2">
          {data && lijst.length === 0 && <li className="text-sm text-schw-mute">Geen gesprekken in deze lijst.</li>}
          {lijst.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                aria-pressed={gekozen === g.id}
                onClick={() => setGekozen(g.id)}
                className={`block w-full rounded-2xl bg-white p-4 text-left shadow-[0_1px_2px_rgba(10,18,14,0.06)] ${gekozen === g.id ? "ring-2 ring-schw-orange" : g.status === "wacht" ? "ring-2 ring-schw-sun" : ""}`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <Pil label={STATUS[g.status][0]} kleur={STATUS[g.status][1]} />
                  {g.ongelezen > 0 && <Pil label={`${g.ongelezen} nieuw`} kleur="bg-[#B91C1C] text-white" />}
                  <span className="ml-auto text-xs text-schw-mute">{tijd(g.laatst)}</span>
                </span>
                <span className="mt-2 line-clamp-2 block text-sm">{g.voorbeeld || "(nog geen vraag)"}</span>
                <span className="mt-1 block text-xs text-schw-mute">
                  {g.toegewezen ? `Toegewezen aan ${naamVan(g.toegewezen)}` : "Niet toegewezen"}
                  {g.account ? ` · ${g.account}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <section aria-label="Gesprek" className={`${KAART} min-h-[24rem]`}>
          {!gesprek ? (
            <p className="text-schw-mute">Kies links een gesprek om mee te lezen.</p>
          ) : (
            <div className="flex h-full flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pil label={STATUS[gesprek.status][0]} kleur={STATUS[gesprek.status][1]} />
                {gesprek.pagina && <span className="text-xs text-schw-mute">gestart op {gesprek.pagina}</span>}
                <div className="ml-auto flex flex-wrap gap-2">
                  {(gesprek.status === "ai" || gesprek.status === "wacht" || gesprek.status === "gesloten") && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "overnemen" })} className={KNOP}>
                      Overnemen
                    </button>
                  )}
                  {gesprek.status === "mens" && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "teruggeven" })} className={KNOP_LICHT}>
                      Teruggeven aan assistent
                    </button>
                  )}
                  {gesprek.status !== "gesloten" && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "sluiten" })} className={KNOP_LICHT}>
                      Sluiten
                    </button>
                  )}
                  {gesprek.account && (
                    <button type="button" onClick={() => openKlant(gesprek.account ?? "")} className={KNOP_LICHT}>
                      Klantdossier
                    </button>
                  )}
                </div>
              </div>
              <label className="block max-w-xs text-sm font-semibold">
                Toegewezen aan
                <select value={gesprek.toegewezen ?? ""} disabled={bezig} onChange={(e) => void doe({ actie: "toewijzen", wie: e.target.value })} className={VELD}>
                  <option value="">Niemand</option>
                  {data?.team.map((t) => (
                    <option key={t.email} value={t.email}>
                      {t.naam}
                      {t.email === data.ik ? " (ik)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div role="log" aria-label="Berichten" className="max-h-[28rem] flex-1 space-y-3 overflow-y-auto rounded-2xl bg-[#F3EEE6] p-4">
                {gesprek.berichten.map((b, i) =>
                  b.rol === "systeem" ? (
                    <p key={i} className="text-center text-xs text-schw-mute">
                      {b.tekst}
                    </p>
                  ) : (
                    <div key={i} className={b.rol === "gast" ? "mr-auto max-w-[85%]" : "ml-auto max-w-[85%]"}>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-schw-mute">
                        {b.rol === "gast" ? "Gast" : b.rol === "ai" ? "Assistent" : (b.door ?? "Medewerker")} · {tijd(b.op)}
                      </p>
                      <p className={`whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${b.rol === "gast" ? "bg-white" : b.rol === "ai" ? "bg-schw-sand" : "bg-schw-night text-schw-cream"}`}>{b.tekst}</p>
                    </div>
                  ),
                )}
              </div>
              <form onSubmit={(e) => void antwoord(e)} className="space-y-2">
                <label className="block text-sm font-semibold">
                  Antwoord als medewerker
                  <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={3} maxLength={2000} className={VELD} />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={bezig || !tekst.trim()} className={KNOP}>
                    Verstuur
                  </button>
                  <p className="text-xs text-schw-mute">Met een antwoord neem je het gesprek over; de assistent zwijgt tot je het teruggeeft.</p>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
