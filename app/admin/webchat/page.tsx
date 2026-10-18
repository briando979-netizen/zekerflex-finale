import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { WebchatInbox } from "@/components/admin/WebchatInbox";

export const dynamic = "force-dynamic";

export default async function WebchatPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHeader title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Website-chat" subtitle="Gesprekken van de chatassistent op de website. De AI antwoordt eerst; neem over wanneer je wilt — je antwoord verschijnt live bij de bezoeker." />
      <WebchatInbox />
    </div>
  );
}
