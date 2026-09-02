import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Post-login router: forwards to the home screen for the principal's role. */
export default async function StartPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const isPlatformAdmin = hasRole(principal, "PLATFORM_ADMIN");

  // E-mail verification is required for everyone except the platform admin.
  if (!isPlatformAdmin && !principal.emailVerifiedAt) {
    redirect("/verifieer-email");
  }

  if (isPlatformAdmin) redirect("/admin");
  if (hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER")) {
    redirect("/werkgever");
  }
  redirect("/dashboard");
}
