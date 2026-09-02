import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { ensureBootChecked } from "@/lib/config/startup";
import { AdminShell } from "@/components/admin/AdminShell";
import { ChatDock } from "@/components/chat/ChatDock";
import {
  IGrid,
  IChat,
  IActivity,
  IShield,
  IDoc,
  IPulse,
  IImage,
  IMail,
  IUsers,
  IBriefcase,
} from "@/components/app/icons";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Controlecentrum", icon: <IGrid />, section: "Hoofd" },
  { href: "/admin/gebruikers", label: "Gebruikers", icon: <IUsers />, section: "Beheer" },
  { href: "/admin/bedrijven", label: "Bedrijven", icon: <IBriefcase />, section: "Beheer" },
  { href: "/admin/integraties", label: "API & integraties", icon: <IDoc />, section: "Beheer" },
  { href: "/admin/jarvis", label: "Jarvis-assistent", icon: <IChat />, section: "Operatie" },
  { href: "/admin/verloning", label: "Wekelijkse verloning", icon: <IDoc />, section: "Operatie" },
  { href: "/admin/fiscaal", label: "Werkvormen & btw", icon: <IDoc />, section: "Operatie" },
  { href: "/admin/disputes", label: "Disputen", icon: <IShield />, section: "Operatie" },
  { href: "/admin/berichten", label: "Berichten & Support", icon: <IChat />, section: "Communicatie" },
  { href: "/admin/mail", label: "Mailbox", icon: <IMail />, section: "Communicatie" },
  { href: "/admin/nieuwsbrief", label: "Nieuwsbrief", icon: <IMail />, section: "Communicatie" },
  { href: "/admin/studio", label: "Studio (beeld)", icon: <IImage />, section: "Communicatie" },
  { href: "/admin/analytics", label: "Verkeer & analytics", icon: <IActivity />, section: "Inzicht" },
  { href: "/admin/audit", label: "Auditspoor", icon: <IDoc />, section: "Inzicht" },
  { href: "/admin/systeem", label: "Systeemstatus", icon: <IPulse />, section: "Inzicht" },
];

// Rendering an admin page triggers the one-time sovereign startup self-check
// (env, DB, Redis, local LLM, RAG, uploads) — idempotent and non-blocking.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  void ensureBootChecked().catch(() => undefined);

  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/admin");
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN", "DISPUTE_MANAGER")) {
    redirect("/dashboard");
  }

  return (
    <AdminShell nav={NAV} userName={principal.fullName} userMeta={principal.email}>
      {children}
      <ChatDock />
    </AdminShell>
  );
}
