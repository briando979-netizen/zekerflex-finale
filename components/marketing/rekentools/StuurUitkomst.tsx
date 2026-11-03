"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { registerUrl } from "@/lib/rekentools/links";

type Tool = { tool: "kosten-uitzendkracht"; input: Record<string, number> } | { tool: "wet-dba-check"; answers: Record<string, string> };

// "Stuur mij de uitkomst": the visitor gets the result by mail and, with
// consent, lands as a warm lead in Admin → Sales. Only the inputs are sent;
// the server computes the result again (lib/rekentools/uitkomst.ts).
export function StuurUitkomst({ payload, label }: { payload: Tool; label: string }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("busy");
    setMsg("");
    try {
      const res = await fetch("/api/rekentools/uitkomst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, email, ...(company.trim() ? { company } : {}), consent, website }),
      });
      if (res.ok) {
        setState("sent");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setMsg(body?.error?.message ?? "Versturen lukte niet. Probeer het later opnieuw.");
      setState("error");
    } catch {
      setMsg("Versturen lukte niet. Controleer je verbinding.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="mt-6 rounded-2xl bg-mintwash p-4 text-sm text-brand-700">
        <p>
          Verstuurd naar <strong>{email}</strong>. Kijk ook even in je spam.
        </p>
        <Link href={registerUrl(email, company)} className="btn-primary mt-3">
          Maak meteen je gratis account
        </Link>
        <p className="mt-2 text-xs text-neutralx-600">Je e-mailadres staat dan al ingevuld.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 border-t border-hair pt-5" noValidate>
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="mt-3 space-y-2.5">
        <label className="block">
          <span className="sr-only">E-mailadres</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="E-mailadres"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-hair bg-paper px-4 py-2.5 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          />
        </label>
        <label className="block">
          <span className="sr-only">Bedrijfsnaam (niet verplicht)</span>
          <input
            type="text"
            autoComplete="organization"
            placeholder="Bedrijfsnaam (niet verplicht)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full rounded-xl border border-hair bg-paper px-4 py-2.5 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          />
        </label>
        {/* Hidden from people; bots fill it in (lib/rekentools/uitkomst.ts isBot). */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-neutralx-600">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-500" />
          <span>
            Stuur mij de uitkomst. ZekerFlex mag mij hierover één keer benaderen. Zie de{" "}
            <Link href="/privacy" className="underline">
              privacyverklaring
            </Link>
            .
          </span>
        </label>
      </div>
      {state === "error" && msg ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {msg}
        </p>
      ) : null}
      <button type="submit" disabled={state === "busy" || !email.trim() || !consent} className="btn-primary mt-4 disabled:opacity-50">
        {state === "busy" ? "Bezig met versturen…" : "Stuur mij de uitkomst"}
      </button>
    </form>
  );
}
