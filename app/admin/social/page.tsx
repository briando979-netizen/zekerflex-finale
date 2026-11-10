import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { SocialHub } from "@/components/admin/social/SocialHub";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Sociale media: kanalen, berichten, campagnes en autopilot op één plek.
export default async function SocialPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Sociale media is alleen beschikbaar voor platformbeheerders." />;
  }
  return <SocialHub />;
}
