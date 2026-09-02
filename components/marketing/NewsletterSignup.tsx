"use client";

import { useState } from "react";

type State = "idle" | "sending" | "done" | "error";

export function NewsletterSignup({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    if (!consent) {
      setState("error");
      setMsg("Zet eerst het vinkje voor toestemming.");
      return;
    }
    setState("sending");
    setMsg("");
    try {
      const res = await fetch("/api/nieuwsbrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMsg(data?.error?.message ?? "Er ging iets mis. Probeer het later opnieuw.");
        return;
      }
      setState("done");
      setMsg(
        data?.alreadySubscribed
          ? "Je bent al ingeschreven — je zit goed."
          : "Bijna klaar: check je inbox en bevestig je inschrijving.",
      );
      setEmail("");
      setConsent(false);
    } catch {
      setState("error");
      setMsg("Geen verbinding. Probeer het later opnieuw.");
    }
  }

  if (state === "done") {
    return (
      <p className="rounded-xl border border-brand-mint/30 bg-brand-mint/10 px-4 py-3 text-sm text-white/85">
        {msg}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jouw@email.nl"
          autoComplete="email"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-brand-mint/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-full bg-brand-mint px-5 py-2.5 text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-60"
        >
          {state === "sending" ? "Bezig…" : "Inschrijven"}
        </button>
      </div>
      <label className="flex items-start gap-2 text-xs text-white/50">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-brand-mint"
        />
        <span>
          Ja, stuur me af en toe nieuws over ZekerFlex. Afmelden kan altijd. Zie de{" "}
          <a href="/privacy" className="underline hover:text-white/80">
            privacyverklaring
          </a>
          .
        </span>
      </label>
      {msg && state === "error" && <p className="text-xs text-red-300">{msg}</p>}
    </form>
  );
}
