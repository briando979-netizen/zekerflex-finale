// De drie planningspagina's die met de vlag `publiek-alleen-flexwerk` onder één menu-item "Planning" vallen
// (lib/werkgever/werkruimte.ts, PLANNING_SAMEN). Puur bestand: de tabbladen (components/werkgever/PlanningTabs.tsx)
// en de tests lezen dezelfde lijst.

export type PlanningTab = "kalender" | "planner" | "agenda";

export const PLANNING_TABS: readonly { id: PlanningTab; href: string; label: string }[] = [
  { id: "kalender", href: "/werkgever/kalender", label: "Kalender" },
  { id: "planner", href: "/werkgever/planner", label: "Roosterplanner" },
  { id: "agenda", href: "/werkgever/agenda", label: "Agenda" },
];
