import { requirePrincipal } from "@/lib/auth";
import { naarStudioAccount } from "@/lib/studio/account-server";
import { getDict } from "@/lib/i18n/server";
import { EmployerMailbox } from "@/components/app/EmployerMailbox";

export const dynamic = "force-dynamic";

export default async function WerkgeverMailPage() {
  const principal = await requirePrincipal();
  // dashboard website of webshop open: het account staat in de studio (lib/studio/account.ts)
  await naarStudioAccount(principal, "mail");
  const dict = await getDict();
  return <EmployerMailbox t={dict.mailbox} zt={dict.zfmail} userEmail={principal.email} />;
}
