"use client";

import { useState } from "react";
import { kortPad } from "@/lib/voorstel/subdomein";

// "Deel met je groep": op de telefoon het deelmenu (WhatsApp, mail…), anders
// de link kopiëren. Op het eigen subdomein het korte adres.

export function DeelUitje({ pad, tekst, licht = false }: { pad: string; tekst: string; licht?: boolean }) {
  const [melding, setMelding] = useState("");

  async function deel() {
    const opSubdomein = !window.location.pathname.startsWith("/voorstel/");
    const url = `${window.location.origin}${opSubdomein ? kortPad(pad) : pad}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: tekst, text: `${tekst}. Alle details:`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMelding("Link gekopieerd: plak hem in de groepsapp.");
    } catch (err) {
      // zelf afgebroken in het deelmenu: niets aan de hand
      if (err instanceof Error && err.name === "AbortError") return;
      setMelding(`Kopieer deze link: ${url}`);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void deel()}
        className={
          licht ? "rounded-full border border-white/20 px-6 py-3 font-semibold" : "rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15"
        }
      >
        Deel met je groep
      </button>
      {melding && (
        <span role="status" className="max-w-xs break-all text-xs">
          {melding}
        </span>
      )}
    </span>
  );
}
