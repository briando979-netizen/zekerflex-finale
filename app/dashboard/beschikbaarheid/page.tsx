import { requirePrincipal } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs/store";
import { PageHeader } from "@/components/app/ui";
import { AvailabilityForm } from "@/components/app/AvailabilityForm";

export const dynamic = "force-dynamic";

export default async function BeschikbaarheidPage() {
  const principal = await requirePrincipal();
  const prefs = await getPrefs(principal.userId);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Beschikbaarheid & tarief"
        subtitle="Jouw regie: wanneer je kunt, wat je minimaal wilt verdienen, en waarvan je een melding wilt."
      />
      <AvailabilityForm initial={prefs} />
    </div>
  );
}
