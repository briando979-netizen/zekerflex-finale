import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { WinkelAI } from "@/components/admin/WinkelAI";

export const dynamic = "force-dynamic";

export default async function WinkelAIPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De Winkel-AI is alleen voor platformbeheerders." />;
  }
  return <WinkelAI />;
}
