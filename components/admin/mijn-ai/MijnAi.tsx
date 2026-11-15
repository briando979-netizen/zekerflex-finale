"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Opmaak } from "./Opmaak";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { groepeerOpDag, STROOM_EINDE, type DagGroep, type GesprekKop, type MijnAiBericht, type MijnAiGesprek } from "@/lib/mijn-ai/vorm";

// Mijn AI (15 nov 2026): een eigen chatomgeving voor de eigenaar, ingericht zoals Claude. Links de gesprekken (zoeken,
// per dag, hernoemen, weghalen), in het midden het gesprek in één rustige kolom, onderin het invoerveld met Stop. Het
// antwoord komt woord voor woord binnen; daarna neemt de pagina de serverversie van het gesprek over (AGENTS.md).

const GROEP: Record<DagGroep, string> = { vandaag: "Vandaag", gisteren: "Gisteren", week: "Afgelopen week", ouder: "Eerder" };

const VOORSTELLEN = [
  "Schrijf een korte, vriendelijke mail aan een werkgever die nog geen klus heeft geplaatst",
  "Leg in gewone taal uit wat de Wet DBA betekent voor zzp'ers die via ZekerFlex werken",
  "Maak een plan voor deze week om meer werkgevers in Groningen te bereiken",
  "Bedenk vijf korte berichten voor sociale media over flexwerk",
];

const groetVoor = (uur: number) => (uur < 6 ? "Goedenacht" : uur < 12 ? "Goedemorgen" : uur < 18 ? "Goedemiddag" : "Goedenavond");

export function MijnAi({ voornaam }: { voornaam: string }) {
  const [koppen, setKoppen] = useState<GesprekKop[]>([]);
  const [model, setModel] = useState("");
  const [gratis, setGratis] = useState(false);
  const [actief, setActief] = useState<MijnAiGesprek | null>(null);
  const [zoek, setZoek] = useState("");
  const [invoer, setInvoer] = useState("");
  const [stroom, setStroom] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState("");
  const [zijbalk, setZijbalk] = useState(false);
  const [hernoem, setHernoem] = useState<{ id: string; titel: string } | null>(null);
  const [groet, setGroet] = useState("");
  const afbreken = useRef<AbortController | null>(null);
  const lijstRef = useRef<HTMLDivElement | null>(null);
  const veldRef = useRef<HTMLTextAreaElement | null>(null);
  const bezig = stroom !== null;

  const laadLijst = useCallback(async () => {
    const r = await fetch("/api/admin/mijn-ai", { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (!d) return;
    setKoppen(Array.isArray(d.gesprekken) ? d.gesprekken : []);
    setModel(typeof d.model === "string" ? d.model : "");
    setGratis(Boolean(d.gratis));
  }, []);

  const laadGesprek = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/mijn-ai/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (d?.gesprek) setActief(d.gesprek as MijnAiGesprek);
    return (d?.gesprek as MijnAiGesprek | undefined) ?? null;
  }, []);

  useEffect(() => {
    void laadLijst();
    // de groet hangt van de klok af: pas in de browser (anders verschilt de server-HTML, AGENTS.md)
    setGroet(groetVoor(amsterdamParts(new Date()).hour));
  }, [laadLijst]);

  // meescrollen met het antwoord, behalve als je zelf omhoog scrolde
  const berichtenAantal = actief?.berichten.length ?? 0;
  useEffect(() => {
    const el = lijstRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [stroom, berichtenAantal]);

  const groei = () => {
    const el = veldRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  const stuur = async (tekst: string, opnieuw = false) => {
    if (bezig || (!opnieuw && !tekst.trim())) return;
    setFout(null);
    setZijbalk(false);
    let gesprek = actief;
    if (!gesprek) {
      const r = await fetch("/api/admin/mijn-ai", { method: "POST" }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => null) : null;
      if (!d?.gesprek) {
        setFout("Er kon geen nieuw gesprek worden gemaakt. Probeer het opnieuw.");
        return;
      }
      gesprek = d.gesprek as MijnAiGesprek;
    }
    const nu = new Date().toISOString();
    const eigen: MijnAiBericht[] = opnieuw
      ? gesprek.berichten.at(-1)?.rol === "ai"
        ? gesprek.berichten.slice(0, -1)
        : gesprek.berichten
      : [...gesprek.berichten, { rol: "jij", tekst: tekst.trim(), at: nu }];
    setActief({ ...gesprek, berichten: eigen });
    if (!opnieuw) {
      setInvoer("");
      window.requestAnimationFrame(groei);
    }
    setStroom("");
    const ctl = new AbortController();
    afbreken.current = ctl;
    const id = gesprek.id;
    try {
      const r = await fetch(`/api/admin/mijn-ai/${encodeURIComponent(id)}/vraag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opnieuw ? { opnieuw: true } : { tekst: tekst.trim() }),
        signal: ctl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        setFout(d?.error?.message ?? "Het lukte niet om de vraag te stellen. Probeer het opnieuw.");
        return;
      }
      const lezer = r.body.getReader();
      const dec = new TextDecoder();
      let alles = "";
      for (;;) {
        const { done, value } = await lezer.read();
        if (done) break;
        alles += dec.decode(value, { stream: true });
        setStroom(alles.split(STROOM_EINDE)[0] ?? "");
      }
      const staart = alles.split(STROOM_EINDE)[1];
      if (staart) {
        const afloop = JSON.parse(staart) as { fout?: string };
        if (afloop.fout) setFout(afloop.fout);
      }
      setMelding("Antwoord klaar");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setFout("De verbinding viel weg. Wat er al stond, is bewaard; probeer het opnieuw.");
    } finally {
      afbreken.current = null;
      setStroom(null);
      // de serverversie overnemen: titel, het bewaarde antwoord (ook een afgebroken stuk)
      await laadGesprek(id);
      void laadLijst();
    }
  };

  const nieuw = () => {
    if (bezig) return;
    setActief(null);
    setFout(null);
    setZijbalk(false);
    veldRef.current?.focus();
  };

  const open = async (id: string) => {
    if (bezig) return;
    setFout(null);
    setZijbalk(false);
    if (!(await laadGesprek(id))) {
      setFout("Dit gesprek bestaat niet meer.");
      void laadLijst();
    }
  };

  const bewaarNaam = async () => {
    if (!hernoem) return;
    const { id, titel } = hernoem;
    setHernoem(null);
    if (!titel.trim()) return;
    const r = await fetch(`/api/admin/mijn-ai/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titel }) }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (d?.gesprek && actief?.id === id) setActief(d.gesprek as MijnAiGesprek);
    void laadLijst();
  };

  const weg = async (k: GesprekKop) => {
    if (!window.confirm(`"${k.titel}" weghalen? Dit kan niet terug.`)) return;
    await fetch(`/api/admin/mijn-ai/${encodeURIComponent(k.id)}`, { method: "DELETE" }).catch(() => null);
    if (actief?.id === k.id) setActief(null);
    void laadLijst();
  };

  const kopieer = (tekst: string) => {
    void navigator.clipboard?.writeText(tekst).then(
      () => setMelding("Gekopieerd"),
      () => undefined,
    );
  };

  const gefilterd = zoek.trim() ? koppen.filter((k) => k.titel.toLowerCase().includes(zoek.trim().toLowerCase())) : koppen;
  const groepen = groepeerOpDag(gefilterd);
  const berichten = actief?.berichten ?? [];
  const leeg = berichten.length === 0 && !bezig;
  const laatsteAi = berichten.length > 0 && berichten.at(-1)?.rol === "ai";
  const modelRegel = model ? `${model}${gratis ? " · op je eigen server" : ""}` : "";

  const invoerVak = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void stuur(invoer);
      }}
      className="rounded-2xl border shadow-sm"
      style={{ borderColor: "var(--a-border-strong)", background: "var(--a-elev)" }}
    >
      <label htmlFor="mijn-ai-vraag" className="sr-only">
        Je vraag
      </label>
      <textarea
        id="mijn-ai-vraag"
        ref={veldRef}
        value={invoer}
        onChange={(e) => {
          setInvoer(e.target.value);
          groei();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void stuur(invoer);
          }
        }}
        rows={leeg ? 3 : 1}
        placeholder={leeg ? "Waar kan ik je mee helpen?" : "Antwoord of stel een nieuwe vraag…"}
        className="block w-full resize-none bg-transparent px-4 pt-3 text-[15px] outline-none"
        style={{ color: "var(--a-text)" }}
      />
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
        <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--a-mute)" }}>
          {modelRegel}
        </span>
        {bezig ? (
          <button
            type="button"
            onClick={() => afbreken.current?.abort()}
            aria-label="Stop"
            className="grid h-8 w-8 place-items-center rounded-full"
            style={{ background: "var(--a-text)", color: "var(--a-panel)" }}
          >
            <span aria-hidden className="block h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--a-panel)" }} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!invoer.trim()}
            aria-label="Versturen"
            className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-40"
            style={{ background: "var(--a-accent)", color: "var(--a-on-accent)" }}
          >
            <span aria-hidden className="text-base leading-none">
              ↑
            </span>
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="relative flex h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-2xl border" style={{ borderColor: "var(--a-border)", background: "var(--a-panel)", color: "var(--a-text)" }}>
      {/* ---- zijbalk: gesprekken ---- */}
      <aside
        className={`${zijbalk ? "absolute inset-y-0 left-0 z-20 flex w-72 shadow-xl" : "hidden"} flex-col border-r md:relative md:flex md:w-72 md:shadow-none`}
        style={{ borderColor: "var(--a-border)", background: "var(--a-panel-2)" }}
        aria-label="Gesprekken"
      >
        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={nieuw}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: "var(--a-accent)", color: "var(--a-on-accent)" }}
          >
            <span aria-hidden>＋</span> Nieuw gesprek
          </button>
          <label className="block">
            <span className="sr-only">Zoek in je gesprekken</span>
            <input
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Zoek in je gesprekken"
              className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: "var(--a-border)", background: "var(--a-elev)", color: "var(--a-text)" }}
            />
          </label>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groepen.length === 0 && (
            <p className="px-2 py-4 text-xs" style={{ color: "var(--a-mute)" }}>
              {zoek.trim() ? "Niets gevonden." : "Nog geen gesprekken. Stel rechts je eerste vraag."}
            </p>
          )}
          {groepen.map((g) => (
            <div key={g.groep} className="mb-3">
              <p className="px-2 pb-1 text-[11px] font-semibold" style={{ color: "var(--a-mute)" }}>
                {GROEP[g.groep]}
              </p>
              <ul className="space-y-0.5">
                {g.gesprekken.map((k) => (
                  <li key={k.id} className="group relative">
                    {hernoem?.id === k.id ? (
                      <input
                        autoFocus
                        aria-label="Nieuwe naam"
                        value={hernoem.titel}
                        onChange={(e) => setHernoem({ id: k.id, titel: e.target.value })}
                        onBlur={() => void bewaarNaam()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void bewaarNaam();
                          if (e.key === "Escape") setHernoem(null);
                        }}
                        className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none"
                        style={{ borderColor: "var(--a-accent)", background: "var(--a-elev)", color: "var(--a-text)" }}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void open(k.id)}
                          aria-current={actief?.id === k.id ? "page" : undefined}
                          className="block w-full truncate rounded-lg py-1.5 pl-2 pr-14 text-left text-sm"
                          style={actief?.id === k.id ? { background: "var(--a-elev-hover)", fontWeight: 600 } : undefined}
                        >
                          {k.titel}
                        </button>
                        <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 gap-0.5 group-focus-within:flex group-hover:flex">
                          <button type="button" onClick={() => setHernoem({ id: k.id, titel: k.titel })} aria-label={`"${k.titel}" hernoemen`} className="rounded px-1 text-xs" style={{ color: "var(--a-mute)" }}>
                            ✎
                          </button>
                          <button type="button" onClick={() => void weg(k)} aria-label={`"${k.titel}" weghalen`} className="rounded px-1 text-xs" style={{ color: "var(--a-mute)" }}>
                            🗑
                          </button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* ---- het gesprek ---- */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--a-border)" }}>
          <button type="button" onClick={() => setZijbalk((o) => !o)} className="rounded-lg px-2 py-1 text-sm md:hidden" aria-expanded={zijbalk} style={{ color: "var(--a-mute)" }}>
            ☰ Gesprekken
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{actief?.titel ?? "Nieuw gesprek"}</p>
        </header>

        {leeg ? (
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
            <p className="mb-6 text-center font-display text-3xl font-semibold" style={{ color: "var(--a-text)" }}>
              {groet ? `${groet}${voornaam ? `, ${voornaam}` : ""}` : " "}
            </p>
            <div className="w-full max-w-2xl">{invoerVak}</div>
            <div className="mt-4 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {VOORSTELLEN.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setInvoer(v);
                    veldRef.current?.focus();
                    window.requestAnimationFrame(groei);
                  }}
                  className="rounded-xl border px-3 py-2 text-left text-sm"
                  style={{ borderColor: "var(--a-border)", color: "var(--a-mute)" }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div ref={lijstRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6" aria-busy={bezig}>
              <div className="mx-auto max-w-3xl space-y-6">
                {berichten.map((b, n) =>
                  b.rol === "jij" ? (
                    <div key={n} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed" style={{ background: "var(--a-panel-2)" }}>
                        {b.tekst}
                      </p>
                    </div>
                  ) : (
                    <div key={n}>
                      <Opmaak tekst={b.tekst} />
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]" style={{ color: "var(--a-mute)" }}>
                        <button type="button" onClick={() => kopieer(b.tekst)} className="hover:underline">
                          Kopiëren
                        </button>
                        {n === berichten.length - 1 && laatsteAi && !bezig && (
                          <button type="button" onClick={() => void stuur("", true)} className="hover:underline">
                            Opnieuw
                          </button>
                        )}
                        {b.onaf && <span>Afgebroken; dit is wat er al was.</span>}
                        {b.model && <span className="ml-auto">{b.model}</span>}
                      </div>
                    </div>
                  ),
                )}
                {bezig && (
                  <div>
                    {stroom ? (
                      <Opmaak tekst={stroom} />
                    ) : (
                      <p className="text-[15px]" style={{ color: "var(--a-mute)" }}>
                        Even denken…
                      </p>
                    )}
                  </div>
                )}
                {fout && (
                  <p role="alert" className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--a-crit-soft)", color: "var(--a-crit)" }}>
                    {fout}
                  </p>
                )}
              </div>
            </div>
            <div className="px-4 pb-4 pt-2">
              <div className="mx-auto max-w-3xl">{invoerVak}</div>
              <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px]" style={{ color: "var(--a-mute)" }}>
                Enter verstuurt, Shift+Enter is een nieuwe regel. De AI kan zich vergissen; controleer belangrijke dingen.
              </p>
            </div>
          </>
        )}
        {leeg && fout && (
          <p role="alert" className="mx-auto mb-4 max-w-2xl rounded-xl px-3 py-2 text-sm" style={{ background: "var(--a-crit-soft)", color: "var(--a-crit)" }}>
            {fout}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {melding}
        </p>
      </section>
    </div>
  );
}
