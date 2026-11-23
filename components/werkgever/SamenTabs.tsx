import Link from "next/link";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { SAMEN_GROEPEN, type SamenGroep } from "@/lib/werkgever/samen-tabs";
import type { MenuSleutel } from "@/lib/werkgever/werkruimte";

// Met de vlag `publiek-alleen-flexwerk` staan een paar pagina's van het werkgeversdashboard als één menu-item
// (lib/werkgever/samen-tabs.ts). Deze tabbladen bovenaan die pagina's zijn dan de weg tussen ze. Zonder de vlag
// staan de pagina's los in het menu en tonen we niets (servercomponent, leest de vlag per request).
// 23 nov 2026 (zoals Mijn workers en Klussen bij YoungOnes): de tabbladen staan onder de kop van de pagina, als een rij met een
// streep onder het actieve tabblad; elk tabblad is minstens 44 px hoog. De streep is groen, zodat hij ook in het donker te zien is.

export async function SamenTabs({ groep, actief }: { groep: SamenGroep; actief: MenuSleutel }) {
  const aan = await alleenFlexwerkAan().catch(() => false);
  if (!aan) return null;
  const g = SAMEN_GROEPEN[groep];
  return (
    <nav aria-label={g.label} className="mb-6 flex flex-wrap items-center gap-1 border-b border-hairstrong">
      {g.tabs.map((tab) => {
        const huidig = tab.id === actief;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={huidig ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold transition-colors ${huidig ? "border-brand-500 text-ink" : "border-transparent text-neutralx-500 hover:text-ink"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
