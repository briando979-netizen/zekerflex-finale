import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
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

  const avatars = await getUserAvatars([principal.userId]);
  const avatarUrl = avatarUrlFor(principal.userId, Boolean(avatars[principal.userId]));

  return (
    <AdminShell userName={principal.fullName} userMeta={principal.email} avatarUrl={avatarUrl}>
      {children}
      <ChatDock />
    </AdminShell>
  );
}
