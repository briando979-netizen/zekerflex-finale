import { getPrincipal, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PapierworkScreen } from "@/components/admin/PapierworkScreen";

export const dynamic = "force-dynamic";

export default async function PapierworkPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    redirect("/login");
  }

  return <PapierworkScreen />;
}
