"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

// De chat op de eigen website (lib/sitechat) voor het bedrijf: aan/uit,
// alle gesprekken, meelezen, overnemen, antwoorden, teruggeven, sluiten en
// toewijzen aan een collega. Lijst en gesprek verversen vanzelf.

type Status = "ai" | "wacht" | "mens" | "gesloten";
interface Rij {
  id: string;
  status: Status;
  laatst: string;
  ongelezen: number;
  toegewezen: string;
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
}
interface Data {
  site: { naam: string; gepubliceerd: boolean; chatAdres: string } | null;
  aan?: boolean;
  gekozen?: boolean;
  standaard?: boolean;
  ik?: string;
  team?: { email: string; naam: string }[];
  gesprekken?: Rij[];
}

const API = "/api/werkgever/sites/chat";
const STATUS: Record<Status, [string, string]> = {
  wacht: ["Wacht op jou", "pill pill-warn"],
  mens: ["Medewerker", "pill pill-neutral"],
  ai: ["Assistent", "pill pill-neutral"],
  gesloten: ["Gesloten", "pill pill-neutral"],
};
const tijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

async function vraag<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store", ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const d = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(d.error?.message ?? "Er ging iets mis.");
  return d;
}

export function SiteChatInbox() {
  const [data, setData] = useState<Data | null>(null);
  const [gekozen, setGekozen] = useState("");
  const [gesprek, setGesprek] = useState<Gesprek | null>(null);
  const [alleenWacht, setAlleenWacht] = useState(false);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const laad = useCallback(async () => {
    try {
      setData(await vraag<Data>(API));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, []);
  useEffect(() => {
    void laad();
    const t = setInterval(() => void laad(), 8000);
    return () => clearInterval(t);
  }, [laad]);

  const laadGesprek = useCallback(async (id: string) => {
    try {
      setGesprek((await vraag<{ gesprek: Gesprek }>(`${API}?id=${encodeURIComponent(id)}`)).gesprek);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, []);
  useEffect(() => {
    if (!gekozen) return;
    void laadGesprek(gekozen);
    const t = setInterval(() => void laadGesprek(gekozen), 5000);
    return () => clearInterval(t);
  }, [gekozen, laadGesprek]);

  async function doe(body: Record<string, unknown>): Promise<boolean> {
    setBezig(true);
    try {
      const d = await vraag<{ gesprek?: Gesprek; aan?: boolean }>(API, body);
      if (d.gesprek) setGesprek(d.gesprek);
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
    if (gesprek && tekst.trim() && (await doe({ actie: "antwoord", id: gesprek.id, tekst }))) setTekst("");
  }

  if (data && !data.site) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-xl font-bold text-ink">Nog geen website</h2>
        <p className="mt-2 text-neutralx-600">Maak eerst je website in de Websitestudio. Daarna kun je hier de chat aanzetten.</p>
      </div>
    );
  }

  const lijst = (data?.gesprekken ?? []).filter((g) => !alleenWacht || g.status === "wacht" || (g.status === "mens" && g.ongelezen > 0));
  const naamVan = (email: string) => data?.team?.find((t) => t.email === email)?.naam ?? email;

  return (
    <div className="space-y-6">
      {fout && (
        <p role="alert" className="pill pill-crit">
          {fout}
        </p>
      )}

      <section className="card p-6" aria-labelledby="chat-instelling">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="chat-instelling" className="font-display text-xl font-bold text-ink">
              Chat op je website
            </h2>
            <p className="mt-2 text-sm text-neutralx-600">
              Rechtsonder op je website staat een knop &quot;Chat met ons&quot;. Een AI-assistent beantwoordt vragen met de gegevens van je website (diensten, veelgestelde vragen, openingstijden, producten). Bezoekers
              kunnen om een medewerker vragen of een afspraak aanvragen. Jij leest hier mee en neemt over wanneer je wilt; zolang jij het gesprek hebt, zwijgt de assistent.
            </p>
            {data?.site && (
              <p className="mt-2 text-sm text-neutralx-600">
                {data.aan ? "Staat aan" : "Staat uit"}
                {data.gekozen ? "" : data.standaard ? " (standaard aan voor nieuwe websites)" : " (bestaande websites zet je zelf aan)"}
                {data.aan && data.site.gepubliceerd ? (
                  <>
                    {" · "}
                    <a href={data.site.chatAdres} target="_blank" rel="noopener noreferrer" className="underline">
                      Bekijk de chat
                    </a>
                  </>
                ) : null}
              </p>
            )}
          </div>
          {data?.site && (
            <button type="button" disabled={bezig} onClick={() => void doe({ actie: "aan", aan: !data.aan })} className={data.aan ? "btn-ghost" : "btn-primary"}>
              {data.aan ? "Zet de chat uit" : "Zet de chat aan"}
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-display text-xl font-bold text-ink">Gesprekken</h2>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={alleenWacht} onChange={(e) => setAlleenWacht(e.target.checked)} />
          Alleen wie op mij wacht
        </label>
        <button type="button" onClick={() => void laad()} className="btn-ghost">
          Vernieuwen
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <ul aria-label="Gesprekken" className="space-y-2">
          {data && lijst.length === 0 && <li className="text-sm text-neutralx-600">Nog geen gesprekken.</li>}
          {lijst.map((g) => (
            <li key={g.id}>
              <button type="button" aria-pressed={gekozen === g.id} onClick={() => setGekozen(g.id)} className={`card block w-full p-4 text-left ${gekozen === g.id ? "ring-2 ring-brand-500" : ""}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className={STATUS[g.status][1]}>{STATUS[g.status][0]}</span>
                  {g.ongelezen > 0 && <span className="pill pill-warn">{g.ongelezen} nieuw</span>}
                  <span className="ml-auto text-xs text-neutralx-600">{tijd(g.laatst)}</span>
                </span>
                <span className="mt-2 line-clamp-2 block text-sm text-ink">{g.voorbeeld || "(nog geen vraag)"}</span>
                <span className="mt-1 block text-xs text-neutralx-600">{g.toegewezen ? `Toegewezen aan ${naamVan(g.toegewezen)}` : "Niet toegewezen"}</span>
              </button>
            </li>
          ))}
        </ul>

        <section aria-label="Gesprek" className="card min-h-[22rem] p-5">
          {!gesprek ? (
            <p className="text-neutralx-600">Kies links een gesprek om mee te lezen.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={STATUS[gesprek.status][1]}>{STATUS[gesprek.status][0]}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  {gesprek.status !== "mens" && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "overnemen", id: gesprek.id })} className="btn-primary">
                      Overnemen
                    </button>
                  )}
                  {gesprek.status === "mens" && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "teruggeven", id: gesprek.id })} className="btn-ghost">
                      Teruggeven aan assistent
                    </button>
                  )}
                  {gesprek.status !== "gesloten" && (
                    <button type="button" disabled={bezig} onClick={() => void doe({ actie: "sluiten", id: gesprek.id })} className="btn-ghost">
                      Sluiten
                    </button>
                  )}
                </div>
              </div>
              <label className="field-label block max-w-xs">
                Toegewezen aan
                <select value={gesprek.toegewezen ?? ""} disabled={bezig} onChange={(e) => void doe({ actie: "toewijzen", id: gesprek.id, wie: e.target.value })} className="field-input mt-1 w-full">
                  <option value="">Niemand</option>
                  {data?.team?.map((t) => (
                    <option key={t.email} value={t.email}>
                      {t.naam}
                      {t.email === data.ik ? " (ik)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <ol aria-label="Berichten" className="max-h-[26rem] space-y-3 overflow-y-auto rounded-2xl border border-neutralx-200 p-4">
                {gesprek.berichten.map((b, i) =>
                  b.rol === "systeem" ? (
                    <li key={i} className="text-center text-xs text-neutralx-600">
                      {b.tekst}
                    </li>
                  ) : (
                    <li key={i} className={b.rol === "gast" ? "mr-auto max-w-[85%]" : "ml-auto max-w-[85%]"}>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-neutralx-600">
                        {b.rol === "gast" ? "Bezoeker" : b.rol === "ai" ? "Assistent" : (b.door ?? "Medewerker")} · {tijd(b.op)}
                      </p>
                      <p className={`whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${b.rol === "gast" ? "border border-neutralx-200 text-ink" : b.rol === "ai" ? "bg-neutralx-100 text-ink" : "bg-ink text-white"}`}>{b.tekst}</p>
                    </li>
                  ),
                )}
              </ol>
              <form onSubmit={(e) => void antwoord(e)} className="space-y-2">
                <label className="field-label block">
                  Antwoord als medewerker
                  <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={3} maxLength={2000} className="field-input mt-1 w-full" />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={bezig || !tekst.trim()} className="btn-primary">
                    Verstuur
                  </button>
                  <p className="text-xs text-neutralx-600">Met een antwoord neem je het gesprek over. De bezoeker ziet het bij &quot;Nieuwe berichten ophalen&quot; of na 15 seconden vanzelf.</p>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
