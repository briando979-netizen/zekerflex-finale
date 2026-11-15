"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

// "Laat me weten als hij er weer is" onder een uitverkochte maat of kleur (lib/shop/voorraadmelding.ts), zoals bol.com.
// Eerst één knop; pas na een klik het e-mailveld, zodat de productpagina rustig blijft.

type Stand = "dicht" | "open" | "bezig" | "klaar" | "wacht" | "al" | "weer-da";

export function VoorraadMelding({ variantId }: { variantId: string }) {
  const { t, locale } = useI18n();
  const [stand, setStand] = useState<Stand>("dicht");
  const [email, setEmail] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const veld = `voorraad-${variantId}`;

  async function stuur(e: FormEvent) {
    e.preventDefault();
    setStand("bezig");
    setFout(null);
    const r = await fetch("/api/shop/voorraadmelding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variantId, email: email.trim(), taal: locale === "en" ? "en" : "nl" }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && d.uitslag === "bevestig") setStand("klaar");
    else if (r?.ok && d.uitslag === "wacht-op-bevestiging") setStand("wacht");
    else if (r?.ok && d.uitslag === "stond-er-al") setStand("al");
    else if (r?.ok && d.uitslag === "op-voorraad") setStand("weer-da");
    else {
      setStand("open");
      setFout(t.shop.voorraadFout);
    }
  }

  if (stand === "klaar" || stand === "wacht" || stand === "al" || stand === "weer-da") {
    return (
      <p role="status" className="mt-2 text-[13px] font-semibold text-ok">
        {stand === "klaar" ? t.shop.voorraadKlaar : stand === "wacht" ? t.shop.voorraadWacht : stand === "al" ? t.shop.voorraadAl : t.shop.voorraadWeerDa}
      </p>
    );
  }
  if (stand === "dicht") {
    return (
      <button type="button" onClick={() => setStand("open")} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 underline-offset-2 hover:underline">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {t.shop.voorraadVraag}
      </button>
    );
  }
  return (
    <form onSubmit={(e) => void stuur(e)} className="mt-3 rounded-lg border border-hair bg-paper-soft p-3">
      <p className="text-[13px] font-bold text-ink">{t.shop.voorraadVraag}</p>
      <p className="mt-0.5 text-[12px] text-neutralx-600">{t.shop.voorraadUitleg}</p>
      <label htmlFor={veld} className="sr-only">
        {t.shop.voorraadEmail}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={veld}
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.shop.voorraadEmail}
          className="h-10 min-w-0 flex-1 rounded-lg border border-hairstrong bg-white px-3 text-[14px] text-ink outline-none focus:border-ink"
        />
        <button type="submit" disabled={stand === "bezig"} className="h-10 shrink-0 rounded-lg bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-60">
          {t.shop.voorraadKnop}
        </button>
      </div>
      {fout && (
        <p role="alert" className="mt-1.5 text-[12px] font-semibold text-crit">
          {fout}
        </p>
      )}
    </form>
  );
}
