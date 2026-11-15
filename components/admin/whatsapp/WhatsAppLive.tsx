"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APanel, AButton } from "@/components/admin/ui";
import { toonNaam, type LiveGesprek, type LiveGesprekKort, type LiveStand } from "@/lib/whatsapp/live";

// Admin → WhatsApp, live (15 nov 2026, eigenaar: "de code scannen vanuit je eigen WhatsApp en de gesprekken live,
// zoals WhatsApp Web"). Niet gekoppeld: de koppelcode, die elke paar seconden ververst. Gekoppeld: de gesprekken links,
// de berichten rechts, en een antwoord versturen. De lijst en het open gesprek komen elke paar seconden opnieuw van de
// server; scrollen gebeurt alleen bij een nieuw laatste bericht.

const klok = (ms: number) => {
  const d = new Date(ms);
  const vandaag = new Date().toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" }) === d.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" });
  return vandaag
    ? d.toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short" });
};

async function lees<T>(res: Response): Promise<{ ok: boolean; data: (T & { error?: { message?: string } }) | null }> {
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  return { ok: res.ok && Boolean(data), data };
}

export function WhatsAppLive() {
  const [stand, setStand] = useState<LiveStand | null>(null);
  const [gesprekken, setGesprekken] = useState<LiveGesprekKort[]>([]);
  const [actief, setActief] = useState<string | null>(null);
  const [gesprek, setGesprek] = useState<LiveGesprek | null>(null);
  const [tekst, setTekst] = useState("");
  const [zoek, setZoek] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const eindeRef = useRef<HTMLDivElement | null>(null);

  const laadStand = useCallback(async () => {
    try {
      const { ok, data } = await lees<{ stand: LiveStand; gesprekken: LiveGesprekKort[] }>(await fetch("/api/admin/whatsapp/live", { cache: "no-store" }));
      if (!ok || !data) {
        setFout(data?.error?.message ?? "WhatsApp laden lukte niet.");
        return;
      }
      setStand(data.stand);
      setGesprekken(Array.isArray(data.gesprekken) ? data.gesprekken : []);
      setFout(null);
    } catch {
      setFout("Netwerkfout: WhatsApp is nu niet te bereiken.");
    }
  }, []);

  useEffect(() => {
    void laadStand();
    const t = setInterval(() => {
      void laadStand();
    }, 4000);
    return () => clearInterval(t);
  }, [laadStand]);

  const laadGesprek = useCallback(async (jid: string) => {
    try {
      const { ok, data } = await lees<{ gesprek: LiveGesprek }>(await fetch(`/api/admin/whatsapp/live/${encodeURIComponent(jid)}`, { cache: "no-store" }));
      if (ok && data?.gesprek) setGesprek(data.gesprek);
    } catch {
      // de volgende ronde probeert het opnieuw
    }
  }, []);

  useEffect(() => {
    if (!actief) return;
    void laadGesprek(actief);
    const t = setInterval(() => {
      void laadGesprek(actief);
    }, 3000);
    return () => clearInterval(t);
  }, [actief, laadGesprek]);

  const laatsteId = gesprek?.jid === actief ? (gesprek?.berichten.at(-1)?.id ?? null) : null;
  useEffect(() => {
    if (laatsteId) eindeRef.current?.scrollIntoView({ block: "end" });
  }, [laatsteId]);

  const zichtbaar = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return z ? gesprekken.filter((g) => toonNaam(g).toLowerCase().includes(z) || (g.laatste?.tekst ?? "").toLowerCase().includes(z)) : gesprekken;
  }, [gesprekken, zoek]);

  async function stuur() {
    if (!actief || !tekst.trim() || bezig) return;
    setBezig(true);
    setFout(null);
    try {
      const { ok, data } = await lees<{ gesprek: LiveGesprek }>(
        await fetch(`/api/admin/whatsapp/live/${encodeURIComponent(actief)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tekst: tekst.trim() }) }),
      );
      if (!ok || !data?.gesprek) {
        setFout(data?.error?.message ?? "Versturen lukte niet. Je bericht staat er nog; probeer het opnieuw.");
        return;
      }
      setGesprek(data.gesprek);
      setTekst("");
    } catch {
      setFout("Netwerkfout: het bericht is niet verstuurd. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  async function ontkoppel() {
    if (!window.confirm("WhatsApp ontkoppelen? De gesprekken verdwijnen uit ZekerFlex; op je telefoon blijft alles staan.")) return;
    setBezig(true);
    try {
      await fetch("/api/admin/whatsapp/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "uitloggen" }) });
      setActief(null);
      setGesprek(null);
      await laadStand();
    } finally {
      setBezig(false);
    }
  }

  const foutRegel = fout ? (
    <p role="alert" className="rounded-lg px-4 py-2.5 text-[0.8125rem]" style={{ background: "var(--a-crit-soft)", color: "var(--a-crit)" }}>
      {fout}
    </p>
  ) : null;

  if (!stand) return <APanel title="WhatsApp live">{foutRegel ?? <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>}</APanel>;

  if (!stand.ingericht)
    return (
      <APanel title="WhatsApp live" subtitle="Je eigen WhatsApp koppelen en je gesprekken hier lezen en beantwoorden">
        <p className="text-sm" style={{ color: "var(--a-dim)" }}>
          De koppeling staat nog niet aan op de server. Zodra hij aan staat, verschijnt hier een code die je met WhatsApp op je telefoon scant.
        </p>
      </APanel>
    );

  if (!stand.verbonden)
    return (
      <APanel title="Koppel je WhatsApp" subtitle="Net als WhatsApp Web: scan de code met de WhatsApp op je telefoon">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="grid h-[280px] w-[280px] shrink-0 place-items-center rounded-xl bg-white p-2">
            {stand.qrSvg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(stand.qrSvg)}`} alt="Koppelcode voor WhatsApp" width={264} height={264} />
            ) : (
              <p className="px-4 text-center text-sm" style={{ color: "#4b5563" }}>
                De code wordt gemaakt…
              </p>
            )}
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm" style={{ color: "var(--a-dim)" }}>
            <li>Open WhatsApp op je telefoon.</li>
            <li>
              Tik op <strong>Instellingen</strong> (iPhone) of <strong>⋮</strong> (Android) en kies <strong>Gekoppelde apparaten</strong> → <strong>Apparaat koppelen</strong>.
            </li>
            <li>Richt je telefoon op deze code. Hij ververst vanzelf; na het scannen verschijnen hier je gesprekken.</li>
            <li className="list-none pt-2 text-xs" style={{ color: "var(--a-mute)" }}>
              Goed om te weten: dit gebruikt hetzelfde koppelprotocol als WhatsApp Web, maar niet de officiële zakelijke dienst van WhatsApp. Gebruik het
              voor je eigen gesprekken, niet om veel mensen tegelijk te berichten: dan kan WhatsApp het nummer blokkeren. Je berichten staan alleen op de
              ZekerFlex-server en op je telefoon.
            </li>
          </ol>
        </div>
        {foutRegel}
      </APanel>
    );

  const open = gesprek && gesprek.jid === actief ? gesprek : null;
  return (
    <div className="space-y-3">
      {foutRegel}
      <APanel pad={false}>
        <div className="grid min-h-[32rem] md:grid-cols-[19rem_1fr]">
          <div className={`${actief ? "hidden md:block" : "block"} border-r`} style={{ borderColor: "var(--a-border)" }}>
            <div className="flex items-center gap-2 p-3">
              <label htmlFor="wa-zoek" className="sr-only">
                Zoek in je gesprekken
              </label>
              <input
                id="wa-zoek"
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Zoeken"
                className="min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-sm"
                style={{ background: "var(--a-elev)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
              />
              <AButton variant="ghost" disabled={bezig} onClick={() => void ontkoppel()}>
                Ontkoppelen
              </AButton>
            </div>
            {zichtbaar.length === 0 ? (
              <p className="p-6 text-center text-sm" style={{ color: "var(--a-mute)" }}>
                {gesprekken.length === 0 ? "Gekoppeld. De gesprekken komen binnen zodra er berichten zijn." : "Niets gevonden."}
              </p>
            ) : (
              <ul className="max-h-[36rem] overflow-y-auto">
                {zichtbaar.map((g) => (
                  <li key={g.jid}>
                    <button
                      type="button"
                      onClick={() => setActief(g.jid)}
                      aria-current={actief === g.jid}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:brightness-110"
                      style={actief === g.jid ? { background: "var(--a-elev)" } : undefined}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                            {toonNaam(g)}
                          </span>
                          {g.laatste && (
                            <span className="shrink-0 text-[11px]" style={{ color: "var(--a-mute)" }}>
                              {klok(g.laatste.tijd)}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs" style={{ color: "var(--a-mute)" }}>
                            {g.laatste ? `${g.laatste.vanMij ? "Jij: " : ""}${g.laatste.tekst}` : ""}
                          </span>
                          {g.ongelezen > 0 && (
                            <span className="shrink-0 rounded-full px-1.5 text-[11px] font-bold" style={{ background: "var(--a-ok)", color: "#fff" }}>
                              {g.ongelezen}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${actief ? "flex" : "hidden md:flex"} min-w-0 flex-col`}>
            {!actief ? (
              <p className="m-auto p-8 text-center text-sm" style={{ color: "var(--a-mute)" }}>
                Kies links een gesprek.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--a-border)" }}>
                  <button type="button" className="md:hidden text-sm" style={{ color: "var(--a-dim)" }} onClick={() => setActief(null)}>
                    ← Terug
                  </button>
                  <span className="truncate text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    {toonNaam(open ?? gesprekken.find((g) => g.jid === actief) ?? { jid: actief, naam: null })}
                  </span>
                </div>
                <div className="max-h-[30rem] min-h-[20rem] flex-1 space-y-1.5 overflow-y-auto p-3" style={{ background: "var(--a-panel-2)" }}>
                  {!open ? (
                    <p className="text-sm" style={{ color: "var(--a-mute)" }}>
                      Laden…
                    </p>
                  ) : (
                    open.berichten.map((b) => (
                      <div key={b.id} className={`flex ${b.vanMij ? "justify-end" : "justify-start"}`}>
                        <div
                          className="max-w-[80%] whitespace-pre-wrap break-words rounded-xl px-3 py-1.5 text-sm"
                          style={b.vanMij ? { background: "var(--a-ok-soft)", color: "var(--a-text)" } : { background: "var(--a-elev)", color: "var(--a-text)" }}
                        >
                          {b.tekst}
                          <span className="ml-2 align-bottom text-[10px]" style={{ color: "var(--a-mute)" }}>
                            {klok(b.tijd)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={eindeRef} />
                </div>
                <form
                  className="flex gap-2 border-t p-3"
                  style={{ borderColor: "var(--a-border)" }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void stuur();
                  }}
                >
                  <label htmlFor="wa-tekst" className="sr-only">
                    Bericht
                  </label>
                  <textarea
                    id="wa-tekst"
                    value={tekst}
                    onChange={(e) => setTekst(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void stuur();
                      }
                    }}
                    rows={1}
                    maxLength={4000}
                    placeholder="Typ een bericht"
                    className="min-w-0 flex-1 resize-none rounded-md px-2.5 py-2 text-sm"
                    style={{ background: "var(--a-elev)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
                  />
                  <AButton type="submit" disabled={bezig || !tekst.trim()}>
                    {bezig ? "Bezig…" : "Versturen"}
                  </AButton>
                </form>
              </>
            )}
          </div>
        </div>
      </APanel>
    </div>
  );
}
