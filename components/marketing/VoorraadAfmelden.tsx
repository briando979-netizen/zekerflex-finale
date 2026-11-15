"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n/I18nProvider";

// De knop "Afmelden" op /shop/voorraadmelding?actie=af (lib/shop/voorraadmelding.ts): pas een klik meldt af, zodat een
// linkscanner die de link uit de mail opent niemand afmeldt.
export function VoorraadAfmelden({ v, a, s }: { v: string; a: string; s: string }) {
  const t = useT();
  const [stand, setStand] = useState<"vraag" | "bezig" | "klaar" | "fout">("vraag");

  async function afmelden() {
    setStand("bezig");
    const r = await fetch("/api/shop/voorraadmelding/afmelden", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ v, a, s }),
    }).catch(() => null);
    setStand(r?.ok ? "klaar" : "fout");
  }

  if (stand === "klaar") {
    return (
      <>
        <p role="status" className="mt-3 text-[15px] text-neutralx-700">
          {t.shop.voorraadAfgemeld}
        </p>
        <Link href="/shop" className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-[14px] font-bold text-white">
          {t.shop.vergelijkNaarShop}
        </Link>
      </>
    );
  }
  return (
    <>
      <p className="mt-3 text-[15px] text-neutralx-700">{t.shop.voorraadAfmeldVraag}</p>
      {stand === "fout" && (
        <p role="alert" className="mt-2 text-[14px] font-semibold text-crit">
          {t.shop.voorraadLinkFout}
        </p>
      )}
      <button type="button" disabled={stand === "bezig"} onClick={() => void afmelden()} className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-[14px] font-bold text-white disabled:opacity-60">
        {t.shop.voorraadAfmeldKnop}
      </button>
    </>
  );
}
