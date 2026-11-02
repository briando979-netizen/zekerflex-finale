import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { EmployerMailbox } from "@/components/app/EmployerMailbox";

export const dynamic = "force-dynamic";

// The admin's own mailbox (personal IMAP connection) — /admin/mail is the
// platform's shared mailbox.
export default async function AdminMyMailPage() {
  const principal = await requirePrincipal();
  const dict = await getDict();
  return (
    <div className="mx-auto max-w-6xl">
      <EmployerMailbox t={dict.mailbox} zt={dict.zfmail} userEmail={principal.email} />
    </div>
  );
}
