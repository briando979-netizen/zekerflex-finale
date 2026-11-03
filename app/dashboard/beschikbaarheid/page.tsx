import { requirePrincipal } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs/store";
import { getFreelancerDict } from "@/lib/i18n/server";
import { PageHeader } from "@/components/app/ui";
import { AvailabilityForm } from "@/components/app/AvailabilityForm";

export const dynamic = "force-dynamic";

export default async function BeschikbaarheidPage() {
  const principal = await requirePrincipal();
  const [prefs, ft] = await Promise.all([getPrefs(principal.userId), getFreelancerDict()]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={ft.avail.title} subtitle={ft.avail.subtitle} />
      <AvailabilityForm initial={prefs} />
    </div>
  );
}
