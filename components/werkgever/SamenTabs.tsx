import Link from "next/link";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { SAMEN_GROEPEN, type SamenGroep } from "@/lib/werkgever/samen-tabs";
import type { MenuSleutel } from "@/lib/werkgever/werkruimte";

// Met de vlag `publiek-alleen-flexwerk` staan een paar pagina's van het werkgeversdashboard als één menu-item
// (lib/werkgever/samen-tabs.ts). Deze tabbladen bovenaan die pagina's zijn dan de weg tussen ze. Zonder de vlag
// staan de pagina's los in het menu en tonen we niets (servercomponent, leest de vlag per request).

export async function SamenTabs({ groep, actief }: { groep: SamenGroep; actief: MenuSleutel }) {
  const aan = await alleenFlexwerkAan().catch(() => false);
  if (!aan) return null;
  const g = SAMEN_GROEPEN[groep];
  return (
    <nav aria-label={g.label} className="mb-5 inline-flex max-w-full flex-wrap rounded-full border border-hair bg-white p-1">
      {g.tabs.map((tab) => {
        const huidig = tab.id === actief;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={huidig ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${huidig ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft hover:text-ink"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
