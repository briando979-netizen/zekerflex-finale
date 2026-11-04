import { requirePrincipal } from "@/lib/auth";
import { BankView } from "@/components/bank/BankView";

export const dynamic = "force-dynamic";

export default async function FreelancerBankPage() {
  await requirePrincipal();
  return (
    <>
      <h1 className="sr-only">ZekerFlex Bank</h1>
      <BankView returnPath="/dashboard/bank" />
    </>
  );
}
