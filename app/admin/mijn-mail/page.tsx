import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { EmployerMailbox } from "@/components/app/EmployerMailbox";

export const dynamic = "force-dynamic";

// The admin's own mailbox (personal IMAP connection) — /admin/mail is the
// platform's shared mailbox.
export default async function AdminMyMailPage() {
  const principal = await requirePrincipal();
  return (
    <div className="mx-auto max-w-6xl">
      <EmployerMailbox t={(await getDict()).mailbox} userEmail={principal.email} />
    </div>
  );
}
