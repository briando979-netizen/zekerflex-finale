import { requirePrincipal } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { Planner } from "@/components/werkgever/Planner";
import { planWeek, weekSleutelVan } from "@/lib/planner/week";

export const dynamic = "force-dynamic";

// Werkgever → Roosterplanner: een week vol open diensten automatisch ingepland
// (lib/planner), met de aanbiedingen als gewone klus-aanbiedingen in de app.
export default async function PlannerPage(props: { searchParams: Promise<{ week?: string }> }) {
  await requirePrincipal();
  const { week } = await props.searchParams;
  const start = week && planWeek(week) ? planWeek(week)!.sleutel : weekSleutelVan(new Date());

  return (
    <>
      <PageHeader
        title="Roosterplanner"
        eyebrow="Personeel"
        subtitle="Alle open diensten van een week in één keer ingepland: de juiste certificaten, dichtbij, uitgerust en binnen de uren. Jij kiest wat je verstuurt; de krachten accepteren zelf."
      />
      <Planner startWeek={start} />
    </>
  );
}
