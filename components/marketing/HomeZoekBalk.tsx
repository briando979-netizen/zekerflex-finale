"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ZOEK_CHIPS, ZOEK_PLACEHOLDER, kiesBestemming } from "@/lib/marketing/home-breed";

// ---------------------------------------------------------------------------
// De frisse, conversationele instap bovenaan de brede voorpagina (19 nov 2026):
// een grote balk waarin je typt wat je zoekt. Het is geen echte AI, maar een
// nette wegwijzer: wat je typt stuurt je naar de juiste bestaande pagina
// (lib/marketing/home-breed.ts, kiesBestemming). Eronder een paar
// snelkeuzeknoppen die rechtstreeks linken. Puur client, zonder prisma/kv/zod.
// ---------------------------------------------------------------------------

export function HomeZoekBalk() {
  const router = useRouter();
  const [tekst, setTekst] = useState("");
  const veldId = useId();

  function verzend(e: React.FormEvent) {
    e.preventDefault();
    router.push(kiesBestemming(tekst));
  }

  return (
    <div className="mx-auto mt-7 w-full max-w-2xl">
      <form onSubmit={verzend} className="group" role="search">
        <label htmlFor={veldId} className="eyebrow mb-2 block text-left text-brand-mint">
          Wat kan ZekerFlex voor je doen?
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur transition focus-within:border-brand-mint/60 focus-within:bg-white/[0.1]">
          <span aria-hidden className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-brand-mint/15 text-brand-mint">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            id={veldId}
            name="zoek"
            type="text"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder={ZOEK_PLACEHOLDER}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base text-white placeholder:text-white/45 focus:outline-none"
          />
          <button
            type="submit"
            className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-brand-mint px-4 py-2.5 text-sm font-bold text-ink shadow-glow transition hover:brightness-105 active:scale-[0.97]"
          >
            <span className="hidden sm:inline">Ga verder</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>

      <ul className="mt-4 flex flex-wrap justify-center gap-2">
        {ZOEK_CHIPS.map((c) => (
          <li key={c.href + c.label}>
            <Link
              href={c.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm font-semibold text-white/80 transition hover:border-brand-mint hover:text-brand-mint"
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
