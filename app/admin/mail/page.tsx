import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { Mailbox } from "@/components/admin/Mailbox";
import { InfoMailPanel } from "@/components/admin/InfoMailPanel";
import { VerkoopMailbox } from "@/components/admin/VerkoopMailbox";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De mailbox is alleen voor platformbeheerders." />;
  }
  return (
    <Mailbox>
      <VerkoopMailbox />
      <InfoMailPanel />
    </Mailbox>
  );
}
