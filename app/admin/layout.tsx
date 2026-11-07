import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { requireAdminTwoFactor } from "@/lib/auth/admin-security";
import { ensureBootChecked } from "@/lib/config/startup";
import { AdminShell } from "@/components/admin/AdminShell";
import { ChatDock } from "@/components/chat/ChatDock";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";

export const dynamic = "force-dynamic";

// Rendering an admin page triggers the one-time sovereign startup self-check
// (env, DB, Redis, local LLM, RAG, uploads) — idempotent and non-blocking.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  void ensureBootChecked().catch(() => undefined);

  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/admin");
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN", "DISPUTE_MANAGER")) {
    redirect("/dashboard");
  }

  // Admins moeten 2FA hebben
  if (hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) {
    await requireAdminTwoFactor(principal.userId).catch(() => {
      redirect("/dashboard/account?setup=2fa");
    });
  }

  const avatars = await getUserAvatars([principal.userId]);
  const avatarUrl = avatarUrlFor(principal.userId, Boolean(avatars[principal.userId]));

  return (
    <AdminShell userName={principal.fullName} userMeta={principal.email} avatarUrl={avatarUrl} limited={!hasRole(principal, "PLATFORM_ADMIN")}>
      {children}
      <ChatDock />
    </AdminShell>
  );
}
