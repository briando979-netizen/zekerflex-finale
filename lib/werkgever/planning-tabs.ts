// De drie planningspagina's die met de vlag `publiek-alleen-flexwerk` onder één menu-item "Planning" vallen.
// De bron is lib/werkgever/samen-tabs.ts (groep planning); dit bestand houdt de oude naam voor de tests.

import { SAMEN_GROEPEN } from "@/lib/werkgever/samen-tabs";

export type PlanningTab = "kalender" | "planner" | "agenda";

export const PLANNING_TABS: readonly { id: PlanningTab; href: string; label: string }[] = SAMEN_GROEPEN.planning.tabs.map((t) => ({ id: t.id as PlanningTab, href: t.href, label: t.label }));
