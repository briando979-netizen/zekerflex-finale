import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { Mailbox } from "@/components/admin/Mailbox";

export const dynamic = "force-dynamic";

export default async function MailPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="De mailbox is alleen voor platformbeheerders." />
      </div>
    );
  }
  return <Mailbox />;
}
