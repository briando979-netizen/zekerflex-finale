import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { brancheVan, dekkingVan, isBranche, koppelingenVan, modulesVan } from "@/lib/branches/branches";
import { GROEP_NAAM, moduleVan, type ModuleGroep } from "@/lib/branches/modules";

export const dynamic = "force-dynamic";

// Het dashboard van een branche: alle modules die dit soort bedrijf nodig heeft, per soort bij elkaar. Wat klaar is, opent een
// echte pagina; wat nog niet gebouwd is, staat er eerlijk bij als "in ontwikkeling". Wat aan elkaar hangt staat eronder.
export default async function BrancheDashboard({ params }: { params: Promise<{ key: string }> }) {
  await requirePrincipal();
  const { key } = await params;
  if (!isBranche(key)) notFound();
  const branche = brancheVan(key);
  if (!branche) notFound();
  const d = dekkingVan(branche);
  const lijst = modulesVan(branche);
  const koppelingen = koppelingenVan(branche);
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

      <div className="mt-5 rounded-xl border border-hair bg-paper-soft p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-ink">
            {d.klaar} van {d.totaal} onderdelen staan klaar
          </span>
          <span className="text-sm text-neutralx-600">{d.procent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="img" aria-label={`${d.procent} procent klaar`}>
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${d.procent}%` }} />
        </div>
        <p className="mt-2 text-xs text-neutralx-500">Gemeten aan de lijst die wij voor deze branche opstelden. Mis je iets, laat het ons weten.</p>
      </div>

      {groepen.map(({ groep, modules }) => (
        <section key={groep} className="mt-7" aria-labelledby={`g-${groep}`}>
          <h2 id={`g-${groep}`} className="font-display text-base font-bold text-ink">
            {GROEP_NAAM[groep]}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {modules.map((m) => (
              <li key={m.sleutel}>
                {m.status === "klaar" && m.href ? (
                  <Link href={m.href} className="block h-full rounded-xl border border-hair bg-white p-4 hover:border-hairstrong">
                    <span className="block text-sm font-semibold text-ink">{m.naam} ›</span>
                    <span className="mt-1 block text-sm text-neutralx-600">{m.wat}</span>
                  </Link>
                ) : (
                  <div className="h-full rounded-xl border border-dashed border-hairstrong p-4">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {m.naam}
                      <span className="rounded bg-paper-soft px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-neutralx-600">In ontwikkeling</span>
                    </span>
                    <span className="mt-1 block text-sm text-neutralx-500">{m.wat}</span>
                  </div>
                )}
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
            {koppelingen.map(({ koppeling: k, werkt }) => (
              <li key={k.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="font-semibold text-ink">
                  {moduleVan(k.van)?.naam} → {moduleVan(k.naar)?.naam}
                </span>
                <span className="text-neutralx-600">{k.wat}</span>
                <span className={`ml-auto text-xs ${werkt ? "text-brand-700" : "text-neutralx-500"}`}>{werkt ? "werkt al" : "komt mee met de nieuwe onderdelen"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
