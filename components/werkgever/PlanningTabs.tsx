import Link from "next/link";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { PLANNING_TABS, type PlanningTab } from "@/lib/werkgever/planning-tabs";

// Met de vlag `publiek-alleen-flexwerk` staan Kalender, Roosterplanner en Agenda als één menu-item "Planning"
// (lib/werkgever/werkruimte.ts, PLANNING_SAMEN). Deze tabbladen bovenaan die drie pagina's zijn dan de weg tussen ze.
// Zonder de vlag staan de drie los in het menu en tonen we niets (servercomponent, leest de vlag per request).

export async function PlanningTabs({ actief }: { actief: PlanningTab }) {
  const aan = await alleenFlexwerkAan().catch(() => false);
  if (!aan) return null;
  return (
    <nav aria-label="Planning" className="mb-5 inline-flex rounded-full border border-hair bg-white p-1">
      {PLANNING_TABS.map((tab) => {
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
