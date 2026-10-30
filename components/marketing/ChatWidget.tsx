"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LogoGlyph } from "@/components/brand/Logo";
import { DEMO_TIME_SLOTS, formatDemoDate, isSelectableDemoDate } from "@/lib/demo/slots";

interface Msg {
  role: "user" | "assistant" | "agent";
  content: string;
  by?: string;
  q?: string; // the question that produced this answer (for rating)
  rated?: "up" | "down";
}

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hoi! 👋 Ik ben de ZekerFlex-assistent. Zoek je werk of personeel, heb je een vraag over uitbetalen, ZekerFlex Bank of aanmelden? Vraag maar raak — ik antwoord meteen.",
};

const SUGGESTIONS = ["Ik zoek werk", "Ik zoek personeel", "Hoe snel word ik uitbetaald?", "Wat is ZekerFlex Bank?", "Wat kost ZekerFlex voor bedrijven?"];

/** The server appends follow-ups as a final line "[[a|b|c]]" — split it off (also while it streams in). */
function splitSuggestions(content: string): { text: string; suggestions: string[] } {
  const i = content.indexOf("\n[[");
  if (i === -1) return { text: content, suggestions: [] };
  const tail = content.slice(i + 3);
  const done = tail.endsWith("]]");
  return { text: content.slice(0, i), suggestions: done ? tail.slice(0, -2).split("|").map((x) => x.trim()).filter(Boolean) : [] };
}

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
  { re: /bank|rekening|pas|sparen|potje/i, label: "ZekerFlex Bank", ask: "Wat is ZekerFlex Bank?" },
  { re: /uren|inchecken|uitchecken/i, label: "Uren & inchecken", ask: "Hoe vul ik mijn uren in?" },
];

/** Stable per-browser conversation token — turns the chat into a ticket an agent can follow. */
function conversationId(): string {
  try {
    let id = localStorage.getItem("zf-webchat-id");
    if (!id) {
      id = `wc-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      localStorage.setItem("zf-webchat-id", id);
    }
    return id;
  } catch {
    return `wc-${Math.random().toString(36).slice(2, 26)}`;
  }
}

export function ChatWidget() {
  const [agentCount, setAgentCount] = useState(0);
  const [human, setHuman] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // While open, pick up replies from a ZekerFlex colleague.
  useEffect(() => {
    if (!open) return;
    const id = conversationId();
    const poll = async () => {
      const r = await fetch(`/api/chat/conversation/${id}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d: { status: string; messages: { content: string; by: string }[] } = await r.json();
      setHuman(d.status === "human");
      if (d.messages.length > agentCount) {
        const fresh = d.messages.slice(agentCount);
        setMessages((m) => [...m, ...fresh.map((x) => ({ role: "agent" as const, content: x.content, by: x.by }))]);
        setAgentCount(d.messages.length);
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 5000);
    return () => clearInterval(t);
  }, [open, agentCount]);

  // live intent as you type
  const liveIntents = useMemo(() => {
    const s = input.trim();
    if (s.length < 3) return [];
    return INTENTS.filter((i) => i.re.test(s)).slice(0, 3);
  }, [input]);

  // Someone asking to be called / to plan a meeting → offer the booking panel.
  const wantsBooking = useMemo(
    () => /\bbel(\s|me|len|afspraak)|terugbel|afspraak|inplan|spreek|spreken|contact opnemen/i.test(input.trim()),
    [input],
  );

  function onBooked(msg: string) {
    setBooking(false);
    setMessages((m) => [...m, { role: "assistant", content: msg }]);
  }

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
        body: JSON.stringify({
          conversationId: conversationId(),
          page: typeof window !== "undefined" ? window.location.pathname : undefined,
          messages: next
            .filter((m) => m.role !== "agent")
            .slice(-8)
            .map((m) => ({ role: m.role as "user" | "assistant", content: splitSuggestions(m.content).text || m.content })),
        }),
      });
      // A colleague has taken over: no AI answer, their reply arrives via polling.
      if (res.headers.get("X-ZF-Human") === "1") {
        setHuman(true);
        return;
      }
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
        aria-expanded={open}
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
              <p className="text-xs text-neutralx-500">{human ? "Een collega van ZekerFlex chat nu met je" : "Antwoordt direct · een collega kan meelezen"}</p>
            </div>
          </div>

          <div ref={scrollRef} role="log" aria-label="Chatberichten" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-brand-500 text-white" : m.role === "agent" ? "border border-brand-500/30 bg-brand-50 text-ink" : "bg-paper-soft text-ink-soft"
                  }`}
                >
                  {m.role === "agent" && <span className="mb-0.5 block text-[11px] font-semibold text-brand-700">👤 {m.by ?? "ZekerFlex"}</span>}
                  <span className="whitespace-pre-line">{splitSuggestions(m.content).text || <span className="text-neutralx-400">…</span>}</span>
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
            {booking && <BookingForm onCancel={() => setBooking(false)} onBooked={onBooked} />}
            {(() => {
              const last = messages[messages.length - 1];
              const follow = last && last.role === "assistant" && messages.length > 1 && !busy ? splitSuggestions(last.content).suggestions : [];
              return follow.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {follow.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-brand-500/40 bg-brand-50 px-3 py-1.5 text-xs text-brand-700 hover:border-brand-500">
                      {s}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
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
          {(liveIntents.length > 0 || (wantsBooking && !booking)) && !busy && (
            <div className="flex flex-wrap gap-1.5 border-t border-hair bg-white px-3 pb-1 pt-2">
              <span className="self-center text-[10px] uppercase tracking-wide text-neutralx-400">Bedoel je</span>
              {wantsBooking && !booking && (
                <button
                  type="button"
                  onClick={() => setBooking(true)}
                  className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-600"
                >
                  📅 Belafspraak plannen
                </button>
              )}
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
            <button
              type="button"
              onClick={() => setBooking((v) => !v)}
              title="Plan een belafspraak of demo"
              aria-pressed={booking}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-base ${
                booking ? "border-brand-500 bg-brand-50 text-brand-600" : "border-hairstrong text-neutralx-500 hover:border-brand-500 hover:text-brand-500"
              }`}
            >
              📅
            </button>
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

/** In-chat booking panel: the assistant plans a real call-back or demo, captures
 *  the details and posts them to /api/afspraak (confirmation mail + calendar). */
function BookingForm({ onCancel, onBooked }: { onCancel: () => void; onBooked: (msg: string) => void }) {
  const [kind, setKind] = useState<"call" | "demo">("call");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 1; i <= 60 && out.length < 15; i++) {
      const c = new Date(now);
      c.setDate(now.getDate() + i);
      const iso = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
      if (isSelectableDemoDate(iso)) out.push(iso);
    }
    return out;
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !date || !time || !consent) {
      setError("Vul je naam, e-mail, datum, tijd en akkoord in.");
      return;
    }
    if (kind === "call" && phone.trim().length < 6) {
      setError("Voor een belafspraak hebben we je telefoonnummer nodig.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/afspraak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          kind,
          date,
          time,
          topic: topic.trim() || undefined,
          conversationId: conversationId(),
          consent: true,
        }),
      });
      const d: { ok?: boolean; when?: string; error?: { message?: string } } = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        setError(d?.error?.message ?? "Het lukte niet om de afspraak vast te leggen. Probeer het zo nog eens.");
        return;
      }
      onBooked(
        `✅ ${kind === "call" ? "Belafspraak" : "Demo"} genoteerd voor ${d.when}. Je krijgt een bevestiging per e-mail met een knop om hem in je agenda te zetten.`,
      );
    } catch {
      setError("De verbinding viel weg. Probeer het zo nog eens.");
    } finally {
      setSubmitting(false);
    }
  }

  const field = "w-full rounded-lg border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-brand-500/30 bg-white p-3 text-ink shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Plan een afspraak</p>
        <button type="button" onClick={onCancel} className="text-xs text-neutralx-400 hover:text-neutralx-700">
          sluiten ✕
        </button>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {([["call", "📞 Bel mij terug"], ["demo", "🖥️ Demo (online)"]] as [typeof kind, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
              kind === k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hair text-neutralx-600 hover:border-brand-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <input className={field} placeholder="Je naam" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <input className={field} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input
          className={field}
          type="tel"
          placeholder={kind === "call" ? "Telefoonnummer (voor de belafspraak)" : "Telefoon (optioneel)"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <select className={field} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum">
            <option value="">Kies een dag…</option>
            {dates.map((iso) => (
              <option key={iso} value={iso}>
                {formatDemoDate(iso)}
              </option>
            ))}
          </select>
          <select className={field} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Tijd">
            <option value="">Tijd…</option>
            {DEMO_TIME_SLOTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <input
          className={field}
          placeholder="Waar gaat het over? (optioneel)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <label className="flex items-start gap-2 pt-0.5 text-[11px] leading-snug text-neutralx-600">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span>Ik ga ermee akkoord dat ZekerFlex contact met me opneemt over deze afspraak.</span>
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-crit">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 w-full rounded-full bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {submitting ? "Bezig…" : kind === "call" ? "Plan belafspraak" : "Plan demo"}
      </button>
    </form>
  );
}
