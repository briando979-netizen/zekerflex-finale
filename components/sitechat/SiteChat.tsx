"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Chatknop rechtsonder voor sites op ZekerFlex (lib/sitechat). De assistent
// antwoordt met de gegevens van het bedrijf; de gast kan een medewerker
// vragen, en zodra die overneemt komen zijn berichten via verversen binnen.
// Elke site geeft zijn eigen kleuren (klassen), teksten en een eigen actie
// mee (bijv. reserveren). Het gesprek blijft bewaard in deze browser.
// ---------------------------------------------------------------------------

export interface ChatStijl {
  /** de ronde knop rechtsonder */
  knop: string;
  /** kop van het venster */
  kop: string;
  /** bubbel van de gast */
  gast: string;
  /** knop voor de eigen actie en versturen */
  actie: string;
}

export interface ChatHulp {
  gesprekId: string;
  sluitActie: () => void;
  /** direct opnieuw ophalen (na een actie die het gesprek aanvult) */
  ververs: () => void;
}

type Rol = "gast" | "ai" | "medewerker" | "systeem";
interface Regel {
  rol: Rol;
  tekst: string;
  door?: string;
}
type Status = "ai" | "wacht" | "mens" | "gesloten";

function maakId(): string {
  const c = globalThis.crypto;
  return c && "randomUUID" in c ? c.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}xxxxxxxx`.slice(0, 32);
}

function lees<T>(sleutel: string, standaard: T): T {
  try {
    const v = window.localStorage.getItem(sleutel);
    return v ? (JSON.parse(v) as T) : standaard;
  } catch {
    return standaard;
  }
}
function schrijf(sleutel: string, waarde: unknown) {
  try {
    window.localStorage.setItem(sleutel, JSON.stringify(waarde));
  } catch {
    /* privévenster of geblokkeerde opslag: dan alleen voor deze pagina */
  }
}

export function SiteChat({
  api,
  opslag,
  titel,
  begroeting,
  suggesties,
  contact,
  stijl,
  actieLabel,
  renderActie,
  wilActie,
}: {
  api: string;
  /** voorvoegsel voor localStorage, uniek per site */
  opslag: string;
  titel: string;
  begroeting: string;
  suggesties: string[];
  /** "bel 0548 51 85 05" */
  contact: string;
  stijl: ChatStijl;
  actieLabel?: string;
  renderActie?: (hulp: ChatHulp) => ReactNode;
  /** herkent een vraag waarbij de actie (bijv. reserveren) handig is */
  wilActie?: (tekst: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [regels, setRegels] = useState<Regel[]>([]);
  const [gezien, setGezien] = useState(0);
  const [status, setStatus] = useState<Status>("ai");
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [actieOpen, setActieOpen] = useState(false);
  const [nieuw, setNieuw] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const invoerRef = useRef<HTMLInputElement>(null);
  const gezienRef = useRef(0);
  const bezigMetVerversen = useRef(false);

  // gesprek uit deze browser terughalen
  useEffect(() => {
    const bewaard = lees<string>(`${opslag}:id`, "");
    const gesprekId = /^[A-Za-z0-9_-]{16,48}$/.test(bewaard) ? bewaard : maakId();
    schrijf(`${opslag}:id`, gesprekId);
    setId(gesprekId);
    setRegels(lees<Regel[]>(`${opslag}:regels`, []));
    const g = lees<number>(`${opslag}:gezien`, 0);
    gezienRef.current = g;
    setGezien(g);
    setStatus(lees<Status>(`${opslag}:status`, "ai"));
  }, [opslag]);

  useEffect(() => {
    if (id) schrijf(`${opslag}:regels`, regels.filter((r) => r.tekst).slice(-60));
  }, [id, opslag, regels]);
  useEffect(() => {
    if (id) {
      schrijf(`${opslag}:gezien`, gezien);
      schrijf(`${opslag}:status`, status);
    }
  }, [id, opslag, gezien, status]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [regels, open, actieOpen]);

  useEffect(() => {
    if (!open) return;
    setNieuw(0);
    invoerRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const ververs = useCallback(async () => {
    // nooit twee keer tegelijk (anders komen dezelfde berichten twee keer binnen)
    if (!id || bezigMetVerversen.current) return;
    bezigMetVerversen.current = true;
    try {
      const r = await fetch(`${api}/${id}?sinds=${gezienRef.current}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d = (await r.json().catch(() => null)) as { status?: Status; totaal?: number; berichten?: { i: number; rol: Rol; tekst: string; door: string }[] } | null;
      if (!d) return;
      if (d.status) setStatus(d.status);
      // alleen wat na de laatst geziene positie komt
      const extra = (d.berichten ?? []).filter((b) => typeof b.i !== "number" || b.i >= gezienRef.current);
      if (typeof d.totaal === "number") {
        gezienRef.current = Math.max(gezienRef.current, d.totaal);
        setGezien(gezienRef.current);
      }
      if (extra.length) {
        setRegels((oud) => [...oud, ...extra.map((b) => ({ rol: b.rol, tekst: b.tekst, ...(b.door ? { door: b.door } : {}) }))]);
        setNieuw((n) => n + extra.filter((b) => b.rol === "medewerker").length);
      }
    } finally {
      bezigMetVerversen.current = false;
    }
  }, [api, id]);

  // verversen: open elke 5 s; dicht alleen als er een medewerker bij is (voor de melding op de knop)
  const heeftGesprek = regels.some((r) => r.rol === "gast");
  useEffect(() => {
    if (!id || !heeftGesprek) return;
    if (!open && status === "ai") return;
    void ververs();
    const t = setInterval(() => void ververs(), open ? 5000 : 15000);
    return () => clearInterval(t);
  }, [id, heeftGesprek, open, status, ververs]);

  async function stuur(tekst: string) {
    const vraag = tekst.trim();
    if (!vraag || bezig || !id) return;
    const historie = [...regels, { rol: "gast" as const, tekst: vraag }];
    setRegels([...historie, { rol: "ai", tekst: "" }]);
    setInvoer("");
    setBezig(true);
    if (wilActie?.(vraag) && renderActie) setActieOpen(true);
    try {
      const r = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          pagina: window.location.pathname,
          berichten: historie
            .filter((x): x is Regel & { rol: "gast" | "ai" } => (x.rol === "gast" || x.rol === "ai") && x.tekst.trim().length > 0)
            .slice(-10)
            .map((x) => ({ rol: x.rol, tekst: x.tekst })),
        }),
      });
      if (r.headers.get("X-ZF-Mens") === "1") {
        // een medewerker heeft het gesprek: geen antwoord van de assistent
        setRegels(historie);
        setStatus("mens");
        await ververs();
        return;
      }
      if (!r.ok || !r.body) throw new Error("geen antwoord");
      const lezer = r.body.getReader();
      const dec = new TextDecoder();
      let antwoord = "";
      for (;;) {
        const { done, value } = await lezer.read();
        if (done) break;
        antwoord += dec.decode(value, { stream: true });
        const nu = antwoord;
        setRegels([...historie, { rol: "ai", tekst: nu }]);
      }
      if (!antwoord.trim()) setRegels([...historie, { rol: "ai", tekst: `Er kwam geen antwoord. Probeer het nog eens, of ${contact}.` }]);
    } catch {
      setRegels([...historie, { rol: "ai", tekst: `Er ging iets mis. Probeer het nog eens, of ${contact}.` }]);
    } finally {
      setBezig(false);
    }
  }

  async function vraagMedewerker() {
    if (!id || bezig) return;
    setBezig(true);
    try {
      await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, actie: "mens", pagina: window.location.pathname }),
      });
      setStatus((s) => (s === "mens" ? s : "wacht"));
      await ververs();
    } finally {
      setBezig(false);
    }
  }

  const verstuur = (e: FormEvent) => {
    e.preventDefault();
    void stuur(invoer);
  };

  const statusRegel =
    status === "mens"
      ? `Je chat met ${[...regels].reverse().find((r) => r.rol === "medewerker")?.door ?? "een medewerker"}`
      : status === "wacht"
        ? "Een medewerker is gevraagd en kijkt zo mee"
        : "AI-assistent · antwoordt meteen";

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={titel}
          className="fixed inset-x-3 bottom-24 z-[60] flex max-h-[min(640px,calc(100vh-8rem))] flex-col overflow-hidden rounded-3xl bg-white text-[#0A120E] shadow-[0_30px_80px_-20px_rgba(10,18,14,0.55)] ring-1 ring-black/10 sm:inset-x-auto sm:right-5 sm:w-[390px]"
        >
          <div className={`flex items-start justify-between gap-3 px-5 py-4 ${stijl.kop}`}>
            <div>
              <p className="font-bold leading-tight">{titel}</p>
              <p className="mt-0.5 text-xs opacity-80">{statusRegel}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Chat sluiten" className="-mr-1 grid h-9 w-9 place-items-center rounded-full hover:bg-white/15">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div ref={logRef} role="log" aria-live="polite" aria-label="Chatberichten" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-[#F3EEE6] px-4 py-2.5 text-sm leading-relaxed">{begroeting}</p>
            {regels.map((r, i) =>
              r.rol === "systeem" ? (
                <p key={i} className="mx-auto max-w-[90%] text-center text-xs text-[#4A524D]">
                  {r.tekst}
                </p>
              ) : r.rol === "gast" ? (
                <p key={i} className={`ml-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed ${stijl.gast}`}>
                  {r.tekst}
                </p>
              ) : (
                <div key={i} className="max-w-[85%]">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#4A524D]">{r.rol === "medewerker" ? (r.door ?? "Medewerker") : "Assistent"}</p>
                  <p className={`whitespace-pre-line rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed ${r.rol === "medewerker" ? "bg-[#E7F0EA] ring-1 ring-[#1F5F3F]/20" : "bg-[#F3EEE6]"}`}>
                    {r.tekst || <span className="inline-block animate-pulse">…</span>}
                  </p>
                </div>
              ),
            )}
            {!heeftGesprek && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggesties.map((s) => (
                  <button key={s} type="button" onClick={() => void stuur(s)} className="rounded-full bg-white px-3 py-1.5 text-left text-xs font-semibold ring-1 ring-black/15 hover:bg-[#F3EEE6]">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {actieOpen && renderActie && (
              <div className="rounded-2xl bg-[#F3EEE6] p-3">{renderActie({ gesprekId: id, sluitActie: () => setActieOpen(false), ververs: () => void ververs() })}</div>
            )}
          </div>

          <div className="border-t border-black/10 px-3 pb-3 pt-2">
            <div className="mb-2 flex flex-wrap gap-2">
              {actieLabel && renderActie && (
                <button type="button" onClick={() => setActieOpen((o) => !o)} aria-pressed={actieOpen} className={`rounded-full px-3 py-1.5 text-xs font-bold ${stijl.actie}`}>
                  {actieLabel}
                </button>
              )}
              {status !== "mens" && (
                <button type="button" onClick={() => void vraagMedewerker()} disabled={bezig || status === "wacht"} className="rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-black/15 hover:bg-[#F3EEE6] disabled:opacity-60">
                  {status === "wacht" ? "Medewerker gevraagd" : "Medewerker"}
                </button>
              )}
            </div>
            <form onSubmit={verstuur} className="flex items-center gap-2">
              <label htmlFor={`${opslag}-invoer`} className="sr-only">
                Je bericht
              </label>
              <input
                id={`${opslag}-invoer`}
                ref={invoerRef}
                value={invoer}
                onChange={(e) => setInvoer(e.target.value)}
                maxLength={1500}
                placeholder="Typ je vraag…"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-full bg-[#F3EEE6] px-4 py-2.5 text-sm outline-none ring-1 ring-transparent focus:ring-2 focus:ring-black/30"
              />
              <button type="submit" disabled={bezig || !invoer.trim()} aria-label="Versturen" className={`grid h-10 w-10 shrink-0 place-items-center rounded-full disabled:opacity-50 ${stijl.actie}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
            <p className="mt-2 text-[11px] leading-snug text-[#4A524D]">Je chat met een AI-assistent; een medewerker kan meelezen en het gesprek overnemen. Deel geen betaalgegevens.</p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Chat sluiten" : nieuw ? `Chat openen, ${nieuw} nieuw bericht van een medewerker` : "Chat openen"}
        className={`fixed bottom-5 right-5 z-[60] flex h-14 items-center gap-2 rounded-full pl-4 pr-5 font-bold shadow-[0_14px_40px_-12px_rgba(10,18,14,0.6)] transition-transform hover:-translate-y-0.5 ${stijl.knop}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <span className="text-sm">{open ? "Sluiten" : "Chat"}</span>
        {nieuw > 0 && !open && <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#B91C1C] px-1 text-[11px] text-white">{nieuw}</span>}
      </button>
    </>
  );
}
