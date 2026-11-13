"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

// De galerij op /website-maken: alle ontwerpen voor een website of webshop, met filters erboven. De kaarten komen van de
// server (lib/sites/ontwerpen.ts); dit bestand filtert alleen. "Bekijk het voorbeeld" staat er alleen als dat voorbeeld
// echt bestaat.

export interface GalerijKaart {
  id: string;
  soort: "website" | "webshop";
  naam: string;
  omschrijving: string;
  categorie: string;
  foto: string;
  voorbeeld: string | null;
}

export function OntwerpGalerij({ kaarten, begin }: { kaarten: GalerijKaart[]; begin: string }) {
  const filters = ["Alle", "Website", "Webshop", ...new Set(kaarten.map((k) => k.categorie))];
  const [filter, setFilter] = useState("Alle");
  const zichtbaar = kaarten.filter((k) => filter === "Alle" || (filter === "Website" ? k.soort === "website" : filter === "Webshop" ? k.soort === "webshop" : k.categorie === filter));

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter de ontwerpen">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === f ? "bg-ink text-white" : "bg-white text-neutralx-700 ring-1 ring-hair hover:ring-ink/40"}`}
          >
            {f}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-neutralx-600" role="status">
        {zichtbaar.length === 1 ? "1 ontwerp" : `${zichtbaar.length} ontwerpen`}
      </p>
      <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {zichtbaar.map((k) => (
          <li key={`${k.soort}-${k.id}`} className="surface flex flex-col overflow-hidden">
            <Image src={k.foto} alt="" width={1200} height={800} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="aspect-[3/2] w-full object-cover" />
            <div className="flex flex-1 flex-col p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                {k.soort === "webshop" ? "Webshop" : "Website"} · {k.categorie}
              </p>
              <h3 className="mt-1 font-display text-xl font-bold text-ink">{k.naam}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{k.omschrijving}</p>
              <p className="mt-4 flex flex-wrap gap-2">
                <Link href={begin} className="btn-primary">
                  Begin hiermee<span className="sr-only">: {k.naam}</span>
                </Link>
                {k.voorbeeld ? (
                  <a href={k.voorbeeld} className="btn-ghost">
                    Bekijk het voorbeeld<span className="sr-only">: {k.naam}</span>
                  </a>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
