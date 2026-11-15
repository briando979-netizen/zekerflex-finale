"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bericht } from "@/lib/horeca-personeel/chat";
import type { PersoneelTeksten } from "@/lib/horeca-personeel/teksten";

// Eén gesprek uit de chat van het personeel (lib/horeca-personeel/chat.ts), voor de medewerker (app/personeel) en voor de
// beheerder (het horeca-beheer). Het ververst elke 5 seconden zolang het scherm open staat. Scrollen gebeurt alleen als het
// laatste bericht verandert, anders springt het gesprek bij elke verversing naar beneden.

const VERVERS_MS = 5000;

export function ChatPaneel(props: {
  t: PersoneelTeksten["chat"];
  taal: string;
  /** het adres van de API; GET geeft { berichten, ik? }, POST { kanaal, tekst }, DELETE { kanaal, id } */
  url: string;
  kanaal: string;
  /** wie ik ben in dit gesprek: "beheer" voor de beheerder, anders het id van de medewerker (komt uit het antwoord) */
  ikIs?: string;
  kanVerwijderen?: boolean;
}) {
  const { t, url, kanaal } = props;
  const [berichten, setBerichten] = useState<Bericht[] | null>(null);
  const [ik, setIk] = useState<string | undefined>(props.ikIs);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const einde = useRef<HTMLDivElement | null>(null);

  const verwerk = useCallback(async (res: Response) => {
    const data = (await res.json().catch(() => ({}))) as { berichten?: Bericht[]; ik?: string; error?: { message?: string } };
    if (!res.ok || !data.berichten) throw new Error(data.error?.message ?? "fout");
    setBerichten(data.berichten);
    if (data.ik) setIk(data.ik);
  }, []);

  useEffect(() => {
    setBerichten(null);
    setFout(null);
    let stop = false;
    async function laad() {
      try {
        await verwerk(await fetch(`${url}?kanaal=${encodeURIComponent(kanaal)}`, { cache: "no-store" }));
      } catch (e) {
        if (!stop) setFout(e instanceof Error && e.message !== "fout" ? e.message : t.fout);
      }
    }
    void laad();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void laad();
    }, VERVERS_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [url, kanaal, verwerk, t.fout]);

  const laatsteId = berichten && berichten.length > 0 ? berichten[berichten.length - 1]?.id : undefined;
  useEffect(() => {
    if (laatsteId) einde.current?.scrollIntoView({ block: "end" });
  }, [laatsteId]);

  async function verstuur() {
    const schoon = tekst.trim();
    if (!schoon) return;
    setBezig(true);
    setFout(null);
    try {
      await verwerk(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kanaal, tekst: schoon }) }));
      setTekst("");
    } catch (e) {
      // het bericht blijft in het veld staan, zodat niets kwijtraakt
      setFout(e instanceof Error && e.message !== "fout" ? e.message : t.fout);
    } finally {
      setBezig(false);
    }
  }

  async function weg(id: string) {
    setFout(null);
    try {
      await verwerk(await fetch(url, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kanaal, id }) }));
    } catch (e) {
      setFout(e instanceof Error && e.message !== "fout" ? e.message : t.fout);
    }
  }

  return (
    <div className="rounded-2xl border border-hair bg-white">
      <div className="max-h-[50vh] min-h-[8rem] space-y-2 overflow-y-auto p-3" role="log" aria-live="polite" aria-label={t.gesprek}>
        {berichten === null ? (
          <p className="text-sm text-neutralx-500">{t.bezig}</p>
        ) : berichten.length === 0 ? (
          <p className="text-sm text-neutralx-500">{t.geen}</p>
        ) : (
          berichten.map((b) => {
            const eigen = ik !== undefined && b.van === ik;
            return (
              <div key={b.id} className={`flex ${eigen ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${eigen ? "bg-brand-50 text-ink" : "bg-paper-soft text-ink"}`}>
                  <p className="text-xs font-semibold text-neutralx-600">{b.van === "beheer" ? `${b.naam} · ${t.beheerder}` : b.naam}</p>
                  <p className="whitespace-pre-line break-words">{b.tekst}</p>
                  <p className="mt-0.5 flex items-center gap-3 text-[11px] text-neutralx-500">
                    <span>{new Intl.DateTimeFormat(props.taal, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(b.op))}</span>
                    {props.kanVerwijderen && (
                      <button type="button" className="font-semibold text-crit hover:underline" onClick={() => void weg(b.id)}>
                        {t.verwijder}
                      </button>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={einde} />
      </div>
      {fout && (
        <p role="alert" className="px-3 pb-1 text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      <form
        className="flex gap-2 border-t border-hair p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void verstuur();
        }}
      >
        <label htmlFor={`chat-${kanaal}`} className="sr-only">
          {t.schrijf}
        </label>
        <input
          id={`chat-${kanaal}`}
          value={tekst}
          maxLength={500}
          onChange={(e) => setTekst(e.target.value)}
          placeholder={t.schrijf}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-lg border border-hairstrong bg-white px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        />
        <button type="submit" className="btn-primary min-h-[44px] text-sm" disabled={bezig || tekst.trim().length === 0}>
          {bezig ? t.bezig : t.verstuur}
        </button>
      </form>
    </div>
  );
}
