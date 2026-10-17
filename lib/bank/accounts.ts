import { randomInt } from "node:crypto";
import type { BankAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { hasRole, type Principal } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Which ZekerFlex Bank account a signed-in person works with:
//   platform admin  → the platform account (fees land here)
//   employer roles  → their organisation's account (shared by its managers;
//                     only HQ_ADMIN may move money out of it)
//   everyone else   → their own personal account
// Accounts are opened on first visit.
// ---------------------------------------------------------------------------

export interface AccountContext {
  account: BankAccount;
  /** may top up, withdraw and request cards */
  canMoveMoney: boolean;
  role: "platform" | "organisation" | "personal";
}

function newNumber(): string {
  let digits = "";
  for (let i = 0; i < 10; i++) digits += String(randomInt(10));
  return `ZF${digits}`;
}

/** "ZF1234567890" → "ZF 12 3456 7890" */
export function formatAccountNumber(n: string): string {
  return n.replace(/^ZF(\d{2})(\d{4})(\d{4})$/, "ZF $1 $2 $3");
}

async function openAccount(data: Pick<BankAccount, "ownerType" | "holderName"> & { userId?: string; tenantId?: string }): Promise<BankAccount> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.bankAccount.create({
        data: {
          ...data,
          number: newNumber(),
          ...(data.ownerType !== "PLATFORM" ? { nextFeeAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) } : {}),
        },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
      // unique clash: either the number (retry) or the owner was opened concurrently
      const existing = data.userId
        ? await prisma.bankAccount.findUnique({ where: { userId: data.userId } })
        : data.tenantId
          ? await prisma.bankAccount.findUnique({ where: { tenantId: data.tenantId } })
          : await prisma.bankAccount.findFirst({ where: { ownerType: "PLATFORM" } });
      if (existing) return existing;
    }
  }
  throw AppError.upstream("Kon geen rekeningnummer toekennen");
}

export async function platformAccount(): Promise<BankAccount> {
  return (
    (await prisma.bankAccount.findFirst({ where: { ownerType: "PLATFORM" } })) ??
    openAccount({ ownerType: "PLATFORM", holderName: "ZekerFlex B.V." })
  );
}

export async function personalAccount(userId: string, holderName: string): Promise<BankAccount> {
  return (await prisma.bankAccount.findUnique({ where: { userId } })) ?? openAccount({ ownerType: "USER", userId, holderName });
}

export async function organisationAccount(tenantId: string): Promise<BankAccount> {
  const existing = await prisma.bankAccount.findUnique({ where: { tenantId } });
  if (existing) return existing;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  if (!tenant) throw AppError.notFound("Organisatie niet gevonden");
  return openAccount({ ownerType: "TENANT", tenantId, holderName: tenant.name });
}

export async function accountForPrincipal(p: Principal): Promise<AccountContext> {
  if (hasRole(p, "PLATFORM_ADMIN")) {
    return { account: await platformAccount(), canMoveMoney: true, role: "platform" };
  }
  const employerGrant = p.grants.find((g) => ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(g.role));
  if (employerGrant) {
    return {
      account: await organisationAccount(employerGrant.organizationId),
      canMoveMoney: hasRole(p, "HQ_ADMIN"),
      role: "organisation",
    };
  }
  return { account: await personalAccount(p.userId, p.fullName), canMoveMoney: true, role: "personal" };
}
