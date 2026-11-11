import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { BRANCHES, dekkingVan } from "@/lib/branches/branches";

export const dynamic = "force-dynamic";

// Werkgever → Branche: kies de soort bedrijf die bij je past en open een dashboard met alles wat die soort nodig heeft,
// samengesteld uit dezelfde modules (lib/branches). Eén account, één betaalstroom, één kaart.
export default async function BranchesKeuze() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-ink">Wat voor bedrijf heb je?</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutralx-600">
        Kies je soort bedrijf. Je ziet dan wat ZekerFlex voor jouw branche al heeft staan, wat er nog komt, en hoe de onderdelen aan elkaar hangen. Alles werkt met hetzelfde account.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {BRANCHES.map((b) => {
          const d = dekkingVan(b);
          return (
            <li key={b.sleutel}>
              <Link href={`/werkgever/branche/${b.sleutel}`} className="block h-full rounded-xl border border-hair bg-white p-4 hover:border-hairstrong">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-base font-bold text-ink">{b.naam}</span>
                  <span className="text-xs text-neutralx-500">
                    {d.klaar} van {d.totaal} klaar
                  </span>
                </span>
                <span className="mt-1 block text-sm text-neutralx-600">{b.voorWie}</span>
                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-brand-50" aria-hidden>
                  <span className="block h-full rounded-full bg-brand-600" style={{ width: `${d.procent}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-xs text-neutralx-500">
        Onderdelen die nog niet klaar zijn, staan er duidelijk bij als &quot;in ontwikkeling&quot;. De lijst per branche is onze eigen inschatting van wat zo&apos;n bedrijf nodig heeft.
      </p>
    </div>
  );
}
