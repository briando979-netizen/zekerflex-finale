"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LogoGlyph } from "@/components/brand/Logo";

interface Msg {
  role: "user" | "assistant";
  content: string;
  q?: string; // the question that produced this answer (for rating)
  rated?: "up" | "down";
}

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hoi! Ik ben de ZekerFlex-assistent. Vraag me over uitbetaling, de Wet DBA, tarieven, aanmelden of hoe matching werkt — ik leer van elke vraag.",
};

const SUGGESTIONS = [
  "Hoe snel word ik uitbetaald?",
  "Wat kost ZekerFlex voor bedrijven?",
  "Hoe zit het met de Wet DBA?",
  "Hoe meld ik me aan als flexwerker?",
];

// Client-side intent recognition — mirrors the server's canned topics so we can
// react the instant someone starts typing.
const INTENTS: { re: RegExp; label: string; ask: string }[] = [
  { re: /uitbetaal|betaald|geld|wanneer.*betaal|loon/i, label: "Uitbetaling", ask: "Hoe snel word ik uitbetaald?" },
  { re: /prijs|kost|tarief|fee|commissie|abonnement/i, label: "Prijzen", ask: "Wat kost ZekerFlex?" },
  { re: /\bdba\b|schijnzelfstand|modelovereenkomst/i, label: "Wet DBA", ask: "Hoe zit het met de Wet DBA?" },
  { re: /aanmeld|registr|account|begin|inschrijv|flexwerker|zzp|uitzend/i, label: "Aanmelden", ask: "Hoe meld ik me aan?" },
  { re: /match|klus|shift|vind.*werk|dienst/i, label: "Matching & klussen", ask: "Hoe werkt matching?" },
  { re: /btw|kvk|factuur|facturatie|kleineondernemers|kor/i, label: "Btw & facturatie", ask: "Heb ik een btw-nummer nodig?" },
  { re: /veilig|privacy|gegevens|avg|data/i, label: "Privacy & veiligheid", ask: "Is mijn data veilig?" },
  { re: /contact|hulp|bereik|mail|telefoon/i, label: "Contact", ask: "Hoe kan ik contact opnemen?" },
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // live intent as you type
  const liveIntents = useMemo(() => {
    const s = input.trim();
    if (s.length < 3) return [];
    return INTENTS.filter((i) => i.re.test(s)).slice(0, 3);
  }, [input]);

  async function rate(idx: number, up: boolean) {
    const m = messages[idx];
    if (!m || m.role !== "assistant" || !m.q) return;
    setMessages((cur) => cur.map((x, i) => (i === idx ? { ...x, rated: up ? "up" : "down" } : x)));
    fetch("/api/chat/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: m.q, a: m.content, up }),
    }).catch(() => undefined);
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-8).map((m) => ({ role: m.role, content: m.content })) }),
      });
      if (!res.body) throw new Error("no stream");
      setMessages((m) => [...m, { role: "assistant", content: "", q: clean }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "assistant", content: acc, q: clean };
          return c;
        });
      }
      if (!acc.trim()) {
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "assistant", content: "Sorry, ik kon geen antwoord ophalen. Probeer het zo nog eens." };
          return c;
        });
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "De assistent is even niet bereikbaar. Probeer het zo opnieuw." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lift transition-transform hover:scale-105"
        aria-label={open ? "Chat sluiten" : "Chat openen"}
      >
        {open ? (
          <span className="text-xl">✕</span>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5v-9Z" fill="currentColor" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[min(38rem,calc(100vh-8rem))] w-[calc(100vw-2rem)] max-w-[27rem] flex-col overflow-hidden rounded-xl2 border border-hairstrong bg-white shadow-lift animate-fade-up">
          <div className="flex items-center gap-3 border-b border-hair bg-paper-soft px-4 py-3">
            <LogoGlyph size={30} />
            <div className="leading-tight">
              <p className="text-sm font-semibold">ZekerFlex-assistent</p>
              <p className="text-xs text-neutralx-500">Lokaal · antwoordt in het Nederlands · leert mee</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-brand-500 text-white" : "bg-paper-soft text-ink-soft"
                  }`}
                >
                  {m.content || <span className="text-neutralx-400">…</span>}
                  {m.role === "assistant" && m.q && m.content && !busy && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => rate(i, true)}
                        className={`text-xs ${m.rated === "up" ? "text-ok" : "text-neutralx-400 hover:text-ok"}`}
                        aria-label="Nuttig"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => rate(i, false)}
                        className={`text-xs ${m.rated === "down" ? "text-crit" : "text-neutralx-400 hover:text-crit"}`}
                        aria-label="Niet nuttig"
                      >
                        ▼
                      </button>
                      {m.rated && <span className="text-[10px] text-neutralx-400">bedankt</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-1.5 rounded-2xl bg-paper-soft px-3.5 py-3">
                <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
              </div>
            )}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-hair px-3 py-1.5 text-xs text-neutralx-600 hover:border-brand-500 hover:text-brand-500"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* live intent chips */}
          {liveIntents.length > 0 && !busy && (
            <div className="flex flex-wrap gap-1.5 border-t border-hair bg-white px-3 pb-1 pt-2">
              <span className="self-center text-[10px] uppercase tracking-wide text-neutralx-400">Bedoel je</span>
              {liveIntents.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => send(it.ask)}
                  className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100"
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-hair p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Stel je vraag…"
              className="flex-1 rounded-full border border-hairstrong px-4 py-2 text-sm outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white disabled:opacity-40"
              aria-label="Versturen"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Dot({ delay = "0s" }: { delay?: string }) {
  return <span className="h-1.5 w-1.5 rounded-full bg-neutralx-400 animate-pulse-dot" style={{ animationDelay: delay }} />;
}
