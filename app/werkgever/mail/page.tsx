import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { EmployerMailbox } from "@/components/app/EmployerMailbox";

export const dynamic = "force-dynamic";

export default async function WerkgeverMailPage() {
  const principal = await requirePrincipal();
  const dict = await getDict();
  return <EmployerMailbox t={dict.mailbox} zt={dict.zfmail} userEmail={principal.email} />;
}
