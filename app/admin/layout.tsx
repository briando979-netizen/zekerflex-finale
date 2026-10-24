import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { ensureBootChecked } from "@/lib/config/startup";
import { AdminShell } from "@/components/admin/AdminShell";
import { ChatDock } from "@/components/chat/ChatDock";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";
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
  IRocket,
  IWallet,
  ICalendar,
} from "@/components/app/icons";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Controlecentrum", icon: <IGrid />, section: "Hoofd" },
  { href: "/admin/te-doen", label: "✅ Te doen voor jou", icon: <IGrid />, section: "Hoofd" },
  { href: "/admin/beheer", label: "⚙️ Beheer (alles instellen)", icon: <IGrid />, section: "Hoofd" },
  { href: "/admin/cockpit", label: "Cockpit (omzet live)", icon: <IPulse />, section: "Hoofd" },
  { href: "/admin/kantoor", label: "Live kantoor", icon: <IActivity />, section: "Hoofd" },
  { href: "/admin/agenda", label: "Agenda", icon: <ICalendar />, section: "Hoofd" },
  { href: "/admin/gebruikers", label: "Gebruikers", icon: <IUsers />, section: "Beheer" },
  { href: "/admin/bedrijven", label: "Bedrijven", icon: <IBriefcase />, section: "Beheer" },
  { href: "/admin/facturen", label: "Facturen", icon: <IDoc />, section: "Beheer" },
  { href: "/admin/financien", label: "Financiën & winst", icon: <IWallet />, section: "Beheer" },
  { href: "/admin/icp", label: "ICP-opgave (btw)", icon: <IDoc />, section: "Operatie" },
  { href: "/admin/stripe", label: "Stripe live", icon: <IWallet />, section: "Beheer" },
  { href: "/admin/bank", label: "ZekerFlex Bank", icon: <IWallet />, section: "Beheer" },
  { href: "/admin/integraties", label: "API & integraties", icon: <IDoc />, section: "Beheer" },
  { href: "/admin/jarvis", label: "Jarvis-assistent", icon: <IChat />, section: "Operatie" },
  { href: "/admin/specialisten", label: "AI-specialisten", icon: <IChat />, section: "Operatie" },
  { href: "/admin/laptop-jarvis", label: "Laptop-Jarvis", icon: <IChat />, section: "Operatie" },
  { href: "/admin/ai-teams", label: "AI-teams (live)", icon: <IActivity />, section: "Operatie" },
  { href: "/admin/verloning", label: "Wekelijkse verloning", icon: <IDoc />, section: "Operatie" },
  { href: "/admin/pensioen", label: "Pensioenaangifte (StiPP)", icon: <IDoc />, section: "Operatie" },
  { href: "/admin/fiscaal", label: "Werkvormen & btw", icon: <IDoc />, section: "Operatie" },
  { href: "/admin/uitzendbureau", label: "Uitzendbureau", icon: <IBriefcase />, section: "Operatie" },
  { href: "/admin/sales", label: "Sales-pijplijn", icon: <IRocket />, section: "Operatie" },
  { href: "/admin/disputes", label: "Disputen", icon: <IShield />, section: "Operatie" },
  { href: "/admin/fraude", label: "Fraude & signalen", icon: <IShield />, section: "Operatie" },
  { href: "/admin/berichten", label: "Berichten & Support", icon: <IChat />, section: "Communicatie" },
  { href: "/admin/webchat", label: "Website-chat (tickets)", icon: <IChat />, section: "Communicatie" },
  { href: "/admin/sollicitaties", label: "Open sollicitaties", icon: <IUsers />, section: "Communicatie" },
  { href: "/admin/mail", label: "Mailbox", icon: <IMail />, section: "Communicatie" },
  { href: "/admin/mijn-mail", label: "Mijn mailbox", icon: <IMail />, section: "Communicatie" },
  { href: "/admin/whatsapp", label: "WhatsApp-import", icon: <IChat />, section: "Communicatie" },
  { href: "/admin/nieuwsbrief", label: "Nieuwsbrief", icon: <IMail />, section: "Communicatie" },
  { href: "/admin/studio", label: "Studio (beeld)", icon: <IImage />, section: "Communicatie" },
  { href: "/admin/shop", label: "Webshopbeheer", icon: <IBriefcase />, section: "Communicatie" },
  { href: "/admin/analytics", label: "Verkeer & analytics", icon: <IActivity />, section: "Inzicht" },
  { href: "/admin/audit", label: "Auditspoor", icon: <IDoc />, section: "Inzicht" },
  { href: "/admin/autopilot", label: "Autopilot (AI doet het zelf)", icon: <IPulse />, section: "Inzicht" },
  { href: "/admin/systeem", label: "Systeemstatus", icon: <IPulse />, section: "Inzicht" },
  { href: "/admin/beveiliging", label: "Beveiliging & 2FA", icon: <IShield />, section: "Inzicht" },
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

  const avatars = await getUserAvatars([principal.userId]);
  const avatarUrl = avatarUrlFor(principal.userId, Boolean(avatars[principal.userId]));

  return (
    <AdminShell nav={NAV} userName={principal.fullName} userMeta={principal.email} avatarUrl={avatarUrl}>
      {children}
      <ChatDock />
    </AdminShell>
  );
}
