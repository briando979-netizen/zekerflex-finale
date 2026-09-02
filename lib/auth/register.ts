import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail, welcomeEmail } from "@/lib/mail";
import { setFiscal } from "@/lib/fiscal/store";

const PLATFORM_TENANT_ID = "org_platform";

export const registerSchema = z
  .object({
    type: z.enum(["freelancer", "bedrijf"]),
    fullName: z.string().trim().min(2, "Vul je volledige naam in").max(120),
    email: z.string().email("Ongeldig e-mailadres").max(160),
    password: z.string().min(8, "Minimaal 8 tekens").max(200),
    passwordConfirm: z.string().max(200).optional(),
    phone: z.string().trim().max(40).optional(),
    companyName: z.string().trim().max(160).optional(),
    /** 8-digit Handelsregister number, when picked from the KVK search. */
    kvkNumber: z
      .string()
      .trim()
      .transform((s) => s.replace(/\D/g, ""))
      .refine((s) => s === "" || s.length === 8, "Ongeldig KVK-nummer")
      .optional(),
    /** For type=freelancer: the worker form (drives the fiscal onboarding). */
    workerKind: z.enum(["zzp", "flexwerker", "uitzendkracht"]).optional(),
  })
  .refine((d) => d.passwordConfirm === undefined || d.password === d.passwordConfirm, {
    message: "De wachtwoorden komen niet overeen.",
    path: ["passwordConfirm"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export interface RegisteredAccount {
  userId: string;
  type: RegisterInput["type"];
  email: string;
}

/** Create a self-serve account. Shared by the API route and the register action. */
export async function registerAccount(input: RegisterInput): Promise<RegisteredAccount> {
  const email = input.email.toLowerCase().trim();

  if (input.type === "bedrijf" && !input.companyName) {
    throw AppError.validation("Vul de naam van je organisatie in");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw AppError.conflict("Er bestaat al een account met dit e-mailadres.");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const userId = await prisma.$transaction(async (tx) => {
    if (input.type === "freelancer") {
      const user = await tx.user.create({
        data: {
          email,
          fullName: input.fullName,
          ...(input.phone ? { phone: input.phone } : {}),
          passwordHash,
          memberships: { create: { tenantId: PLATFORM_TENANT_ID, role: "FREELANCER" } },
        },
        select: { id: true },
      });
      return user.id;
    }

    let kvk = input.kvkNumber && input.kvkNumber.length === 8 ? input.kvkNumber : null;
    if (kvk) {
      const clash = await tx.tenant.findFirst({ where: { kvkNumber: kvk }, select: { id: true } });
      if (clash) kvk = null; // already claimed — keep the name, drop the number
    }
    const tenant = await tx.tenant.create({
      data: {
        name: input.companyName!,
        type: "ENTERPRISE_HQ",
        country: "NL",
        ...(kvk ? { kvkNumber: kvk } : {}),
      },
      select: { id: true },
    });
    const user = await tx.user.create({
      data: {
        email,
        fullName: input.fullName,
        ...(input.phone ? { phone: input.phone } : {}),
        passwordHash,
        memberships: { create: { tenantId: tenant.id, role: "HQ_ADMIN" } },
      },
      select: { id: true },
    });
    return user.id;
  });

  await recordAudit({
    category: "AUTH",
    action: "auth.register",
    actorUserId: userId,
    actorLabel: "user",
    summary: `Nieuw ${input.type}-account aangemaakt: ${email}`,
    targetType: "user",
    targetId: userId,
    metadata: { type: input.type },
  });

  // Stash the chosen worker form for the fiscal onboarding (filesystem only).
  if (input.type === "freelancer" && input.workerKind) {
    void setFiscal(userId, { workerKind: input.workerKind }).catch(() => undefined);
  }

  // Welcome mail — best-effort, captured in the local mailbox regardless.
  const tpl = welcomeEmail(input.fullName, input.type, env.APP_BASE_URL);
  void sendMail({ ...tpl, to: email }).catch(() => undefined);

  return { userId, type: input.type, email };
}
