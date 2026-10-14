import type { Metadata } from "next";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTeamInviteToken, getTeamInvite } from "@/lib/team/invite";
import { TeamInviteAccept } from "@/components/app/TeamInviteAccept";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teamuitnodiging", robots: { index: false } };

const ROLE_LABEL: Record<string, string> = {
  HQ_ADMIN: "Beheerder",
  LOCAL_MANAGER: "Lokale manager",
  DISPUTE_MANAGER: "Geschillenbeheerder",
};

export default async function TeamInvitePage(props: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await props.searchParams;
  const payload = token ? await verifyTeamInviteToken(token) : null;
  const record = payload ? await getTeamInvite(payload.tenantId, payload.id) : null;
  const valid = Boolean(payload && record && record.status === "pending");

  if (!valid || !payload) {
    return <TeamInviteAccept valid={false} token={token ?? ""} />;
  }

  const [principal, existingUser] = await Promise.all([
    getPrincipal(),
    prisma.user.findUnique({ where: { email: payload.email }, select: { id: true } }),
  ]);

  return (
    <TeamInviteAccept
      valid
      token={token!}
      tenantName={payload.tenantName}
      roleLabel={ROLE_LABEL[payload.role] ?? payload.role}
      invitedByName={payload.invitedByName}
      email={payload.email}
      userExists={Boolean(existingUser)}
      loggedInAsMatchingEmail={Boolean(principal && principal.email.toLowerCase() === payload.email.toLowerCase())}
      loggedInAsOtherEmail={principal && principal.email.toLowerCase() !== payload.email.toLowerCase() ? principal.email : null}
    />
  );
}
