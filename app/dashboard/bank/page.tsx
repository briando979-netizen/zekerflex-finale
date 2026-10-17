import { requirePrincipal } from "@/lib/auth";
import { BankView } from "@/components/bank/BankView";

export const dynamic = "force-dynamic";

export default async function FreelancerBankPage() {
  await requirePrincipal();
  return <BankView returnPath="/dashboard/bank" />;
}
