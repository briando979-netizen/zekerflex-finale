import { SamenTabs } from "@/components/werkgever/SamenTabs";
import type { PlanningTab } from "@/lib/werkgever/planning-tabs";

// Kalender, Roosterplanner en Agenda als één ingang "Planning" (lib/werkgever/samen-tabs.ts, groep planning).
export function PlanningTabs({ actief }: { actief: PlanningTab }) {
  return <SamenTabs groep="planning" actief={actief} />;
}
