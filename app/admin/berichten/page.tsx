import { getPrincipal, hasRole } from "@/lib/auth";
import { APageHeader } from "@/components/admin/ui";
import { InboxPage } from "@/components/chat/InboxPage";

export const dynamic = "force-dynamic";

export default async function AdminBerichtenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN", "HQ_ADMIN")) {
    return <APageHeader title="Geen toegang" subtitle="Berichten zijn voor beheerders." />;
  }
  return (
    <>
      <APageHeader
        title="Berichten & Support"
        subtitle="Alle support-gesprekken van gebruikers. Reageer als ZekerFlex Support."
      />
      <div className="mt-4">
        <InboxPage />
      </div>
    </>
  );
}
