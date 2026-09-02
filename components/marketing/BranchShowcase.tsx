"use client";

import Link from "next/link";
import { useState } from "react";
import { Reveal } from "@/components/marketing/Reveal";

interface Branch {
  key: string;
  label: string;
  photo: string;
  rating: number;
  reviews: number;
  fromCents: number;
  blurb: string;
}

// Illustratief overzicht per branche — de waardering is het gemiddelde dat
// krachten in die branche geven, het tarief is een richtprijs "vanaf".
const BRANCHES: Branch[] = [
  { key: "logistiek", label: "Logistiek", photo: "/shifts/logistiek.jpg", rating: 4.6, reviews: 210, fromCents: 1450, blurb: "Orderpicken, magazijn, inpakken en sorteren." },
  { key: "retail", label: "Retail", photo: "/shifts/retail.jpg", rating: 4.7, reviews: 560, fromCents: 1400, blurb: "Vakkenvullen, kassa en verkoop op de winkelvloer." },
  { key: "horeca", label: "Horeca", photo: "/shifts/horeca.jpg", rating: 4.5, reviews: 580, fromCents: 1500, blurb: "Bediening, bar, keuken en catering." },
  { key: "evenement", label: "Evenement", photo: "/shifts/evenement.jpg", rating: 4.8, reviews: 410, fromCents: 1600, blurb: "Festivals, beurzen, hosting en crew." },
  { key: "schoonmaak", label: "Schoonmaak", photo: "/shifts/schoonmaak.jpg", rating: 4.6, reviews: 330, fromCents: 1550, blurb: "Housekeeping, glasbewassing en oplevering." },
  { key: "zorg", label: "Zorg", photo: "/shifts/zorg.jpg", rating: 4.9, reviews: 290, fromCents: 1850, blurb: "Ondersteuning, begeleiding en welzijn." },
  { key: "kantoor", label: "Kantoor", photo: "/shifts/kantoor.jpg", rating: 4.5, reviews: 370, fromCents: 1650, blurb: "Receptie, administratie en klantenservice." },
  { key: "bouw", label: "Bouw & techniek", photo: "/shifts/bouw.jpg", rating: 4.7, reviews: 240, fromCents: 1900, blurb: "Montage, installatie, grond- en sloopwerk." },
];

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

function Stars({ n }: { n: number }) {
  const full = Math.round(n);
  return (
    <span className="text-amber-400" aria-label={`${n.toFixed(1)} van 5`}>
      {"★★★★★".slice(0, full)}
      <span className="text-neutralx-300">{"★★★★★".slice(full)}</span>
    </span>
  );
}

function Card({ b }: { b: Branch }) {
  const [liked, setLiked] = useState(false);
  return (
    <Link
      href="/voor-freelancers"
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-hair bg-paper shadow-e1 transition-all duration-300 hover:-translate-y-1 hover:shadow-e3"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={b.photo}
          alt={b.label}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setLiked((v) => !v);
          }}
          aria-label={liked ? "Verwijder uit favorieten" : "Voeg toe aan favorieten"}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-lg shadow-e1 backdrop-blur transition hover:scale-110"
        >
          <span className={liked ? "text-brand-mint" : "text-neutralx-400"}>{liked ? "♥" : "♡"}</span>
        </button>
        <span className="absolute bottom-3 left-3 font-display text-lg font-bold uppercase tracking-wide text-white drop-shadow">
          {b.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-1.5 text-sm">
          <Stars n={b.rating} />
          <span className="text-neutralx-400">
            {b.rating.toFixed(1).replace(".", ",")} · {b.reviews} beoordelingen
          </span>
        </div>
        <p className="mt-1.5 flex-1 text-sm text-neutralx-500">{b.blurb}</p>
        <div className="mt-3 border-t border-hair pt-3">
          <p>
            <span className="text-xs text-neutralx-400">vanaf </span>
            <span className="num font-display text-lg font-bold text-ink">{euro(b.fromCents)}</span>
            <span className="text-xs font-medium text-neutralx-400"> /uur</span>
          </p>
          <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
            Bekijk klussen
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function BranchShowcase() {
  return (
    <section className="relative bg-paper-soft">
      <div className="shell-4k py-28 lg:py-36">
        <Reveal>
          <p className="eyebrow">Branches</p>
          <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">
            Werk in de branche die bij je past
          </h2>
          <p className="fluid-lead mt-5 max-w-2xl text-neutralx-600">
            Van magazijn tot bediening. Elke dienst met foto, waardering en een helder uurtarief —
            zodat je precies weet waar je aan toe bent voordat je reageert.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {BRANCHES.map((b, i) => (
            <Reveal key={b.key} delay={i * 70}>
              <Card b={b} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link href="/register" className="btn-primary">
              Bekijk alle klussen
            </Link>
            <span className="text-sm text-neutralx-500">Gratis aanmelden — je zit nergens aan vast.</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
