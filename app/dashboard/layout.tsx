import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { FreelancerShell } from "@/components/app/FreelancerShell";
import { ChatDock } from "@/components/chat/ChatDock";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/dashboard");
  if (!hasRole(principal, "FREELANCER")) redirect("/start");
  if (!principal.emailVerifiedAt) redirect("/verifieer-email");

  return (
    <FreelancerShell userName={principal.fullName}>
      {children}
      <ChatDock />
    </FreelancerShell>
  );
}
