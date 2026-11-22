"use client";

import { useState } from "react";

/** Aanmelden voor de testgroep van de Android-app (21 nov 2026): het adres komt bij ZekerFlex op een lijst, zonder mailprogramma. */
export function TesterWordenForm() {
  const [email, setEmail] = useState("");
  const [stand, setStand] = useState<"leeg" | "bezig" | "klaar" | "fout">("leeg");
  const [fout, setFout] = useState("");

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    setStand("bezig");
    const r = await fetch("/api/app/tester", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    if (r?.ok) {
      setStand("klaar");
      return;
    }
    const d = r ? await r.json().catch(() => null) : null;
    setFout(d?.error?.message ?? "Dat lukte even niet. Probeer het zo opnieuw.");
    setStand("fout");
  }

  if (stand === "klaar") {
    return (
      <p role="status" className="mt-2 rounded-lg bg-white/[0.08] px-3 py-2 text-white">
        ✓ Gelukt. We zetten je op de lijst. Open daarna de link hieronder.
      </p>
    );
  }
  return (
    <form onSubmit={(e) => void verstuur(e)} className="mt-2 flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="tester-email">
        Je Gmail-adres
      </label>
      <input
        id="tester-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="jouwnaam@gmail.com"
        autoComplete="email"
        className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      <button type="submit" disabled={stand === "bezig" || !email.trim()} className="btn-mint text-sm disabled:opacity-60">
        {stand === "bezig" ? "Bezig…" : "Aanmelden"}
      </button>
      {stand === "fout" && (
        <p role="alert" className="w-full text-xs text-red-300">
          {fout}
        </p>
      )}
    </form>
  );
}
