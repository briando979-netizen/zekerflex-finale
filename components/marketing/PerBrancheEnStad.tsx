import Link from "next/link";
import { SECTORS, inhurenKop, werkKop } from "@/lib/seo-sectors";
import { topSteden } from "@/lib/seo-cities";

// Links naar de branche- en stadspagina's (22 nov 2026): /voor-freelancers en /voor-bedrijven linkten nog niet naar de
// steden, en /voor-bedrijven ook niet naar de branches. Werkers gaan naar /<branche>-vacatures en /freelance-werk/<stad>,
// bedrijven naar /<branche>-personeel-inhuren en /personeel-inhuren/<stad>. De steden in de volgorde van lib/seo-cities.ts
// (TOP_STEDEN: waar het meest op gezocht wordt).

type Voor = "werkers" | "bedrijven";

const TEKST: Record<Voor, { branches: string; steden: string; alle: string }> = {
  werkers: { branches: "Werk per branche", steden: "Werk per stad", alle: "/freelance-werk" },
  bedrijven: { branches: "Personeel per branche", steden: "Personeel per stad", alle: "/personeel-inhuren" },
};

function Rij({ kop, links }: { kop: string; links: { href: string; label: string }[] }) {
  return (
    <div className="mt-8">
      <h3 className="font-display text-lg font-bold text-ink">{kop}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PerBrancheEnStad({ voor, branches = true }: { voor: Voor; branches?: boolean }) {
  const t = TEKST[voor];
  const steden = topSteden().map((c) => ({ href: voor === "werkers" ? `/freelance-werk/${c.slug}` : `/personeel-inhuren/${c.slug}`, label: c.name }));
  return (
    <div className="mt-6">
      {branches && (
        <Rij
          kop={t.branches}
          links={SECTORS.map((s) => (voor === "werkers" ? { href: `/${s.workerSlug}`, label: werkKop(s) } : { href: `/${s.slug}`, label: inhurenKop(s) }))}
        />
      )}
      <Rij kop={t.steden} links={[...steden, { href: t.alle, label: "Alle steden" }]} />
    </div>
  );
}
