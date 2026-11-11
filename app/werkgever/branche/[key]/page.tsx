import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { brancheVan, isBranche, koppelingenVan, modulesVan } from "@/lib/branches/branches";
import { GROEP_NAAM, moduleVan, type ModuleGroep } from "@/lib/branches/modules";

export const dynamic = "force-dynamic";

// Het dashboard van een branche: de modules die dit soort bedrijf nodig heeft, per soort bij elkaar, en hoe ze aan elkaar hangen.
// Een klant ziet alleen wat nu echt werkt (AGENTS.md: alleen wat nu echt kan, staat op de site); wat nog gepland is en de
// dekking per branche staan alleen in Beheer → Branches.
export default async function BrancheDashboard({ params }: { params: Promise<{ key: string }> }) {
  await requirePrincipal();
  const { key } = await params;
  if (!isBranche(key)) notFound();
  const branche = brancheVan(key);
  if (!branche) notFound();
  const lijst = modulesVan(branche).filter((m) => m.status === "klaar" && m.href);
  const koppelingen = koppelingenVan(branche).filter((k) => k.werkt);
  const groepen = (Object.keys(GROEP_NAAM) as ModuleGroep[]).map((g) => ({ groep: g, modules: lijst.filter((m) => m.groep === g) })).filter((g) => g.modules.length > 0);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm">
        <Link href="/werkgever/branche" className="text-neutralx-500 underline underline-offset-2">
          Alle branches
        </Link>
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">{branche.naam}</h1>
      <p className="mt-1 text-sm text-neutralx-600">{branche.voorWie}</p>

      {groepen.map(({ groep, modules }) => (
        <section key={groep} className="mt-7" aria-labelledby={`g-${groep}`}>
          <h2 id={`g-${groep}`} className="font-display text-base font-bold text-ink">
            {GROEP_NAAM[groep]}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {modules.map((m) => (
              <li key={m.sleutel}>
                <Link href={m.href ?? "/werkgever"} className="block h-full rounded-xl border border-hair bg-white p-4 hover:border-hairstrong">
                  <span className="block text-sm font-semibold text-ink">{m.naam} ›</span>
                  <span className="mt-1 block text-sm text-neutralx-600">{m.wat}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {koppelingen.length > 0 && (
        <section className="mt-8" aria-labelledby="koppelingen">
          <h2 id="koppelingen" className="font-display text-base font-bold text-ink">
            Zo hangt het samen
          </h2>
          <ul className="mt-3 divide-y divide-hair rounded-xl border border-hair bg-white">
            {koppelingen.map(({ koppeling: k }) => (
              <li key={k.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="font-semibold text-ink">
                  {moduleVan(k.van)?.naam} → {moduleVan(k.naar)?.naam}
                </span>
                <span className="text-neutralx-600">{k.wat}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
