import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { RecruiterConsole } from "@/components/admin/RecruiterConsole";

export const dynamic = "force-dynamic";

export default async function AdminRecruiterPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De AI-recruiter is alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        title="AI-recruiter"
        subtitle="Zoekt kandidaten in je eigen pool, rangschikt ze met uitleg en certificaten, en schrijft een persoonlijk concept-bericht. Jij kiest en verstuurt. Er gaan geen gegevens naar een externe dienst."
      />
      <RecruiterConsole />
    </div>
  );
}
