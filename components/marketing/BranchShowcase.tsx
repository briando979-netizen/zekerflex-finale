import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";

interface Branch {
  key: string;
  label: string;
  photo: string;
  blurb: string;
}

// Ingang per branche. Geen verzonnen waarderingen of richtprijzen: alleen het
// echte minimum-uurtarief dat een opdrachtgever mag instellen (env.MIN_SHIFT_RATE_CENTS).
const BRANCHES: Branch[] = [
  { key: "logistiek", label: "Logistiek", photo: "/shifts/logistiek.jpg", blurb: "Orderpicken, magazijn, inpakken en sorteren." },
  { key: "retail", label: "Retail", photo: "/shifts/retail.jpg", blurb: "Vakkenvullen, kassa en verkoop op de winkelvloer." },
  { key: "horeca", label: "Horeca", photo: "/shifts/horeca.jpg", blurb: "Bediening, bar, keuken en catering." },
  { key: "evenement", label: "Evenement", photo: "/shifts/evenement.jpg", blurb: "Festivals, beurzen, hosting en crew." },
  { key: "schoonmaak", label: "Schoonmaak", photo: "/shifts/schoonmaak.jpg", blurb: "Housekeeping, glasbewassing en oplevering." },
  { key: "zorg", label: "Zorg", photo: "/shifts/zorg.jpg", blurb: "Ondersteuning, begeleiding en welzijn." },
  { key: "kantoor", label: "Kantoor", photo: "/shifts/kantoor.jpg", blurb: "Receptie, administratie en klantenservice." },
  { key: "bouw", label: "Bouw & techniek", photo: "/shifts/bouw.jpg", blurb: "Montage, installatie, grond- en sloopwerk." },
];

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

function Card({ b, minRateCents }: { b: Branch; minRateCents: number }) {
  return (
    <Link
      href="/klussen"
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-hair bg-paper shadow-e1 transition-all duration-300 hover:-translate-y-1 hover:shadow-e3"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={b.photo}
          alt={b.label}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 font-display text-lg font-bold uppercase tracking-wide text-white drop-shadow">
          {b.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="flex-1 text-sm text-neutralx-500">{b.blurb}</p>
        <div className="mt-3 border-t border-hair pt-3">
          <p>
            <span className="text-xs text-neutralx-400">minimaal </span>
            <span className="num font-display text-lg font-bold text-ink">{euro(minRateCents)}</span>
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

export function BranchShowcase({ minRateCents }: { minRateCents: number }) {
  return (
    <section className="relative bg-paper-soft">
      <div className="shell-4k py-28 lg:py-36">
        <Reveal>
          <p className="eyebrow">Branches</p>
          <h2 className="fluid-h2 mt-4 max-w-3xl text-balance font-display font-bold">
            Werk in de branche die bij je past
          </h2>
          <p className="fluid-lead mt-5 max-w-2xl text-neutralx-600">
            Van magazijn tot bediening. Elke klus met foto, reistijd en een helder uurtarief —
            zodat je precies weet waar je aan toe bent voordat je reageert.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {BRANCHES.map((b, i) => (
            <Reveal key={b.key} delay={i * 70}>
              <Card b={b} minRateCents={minRateCents} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link href="/klussen" className="btn-primary">
              Bekijk alle klussen
            </Link>
            <span className="text-sm text-neutralx-500">Gratis aanmelden — je zit nergens aan vast.</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
