import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { setFiscal } from "@/lib/fiscal/store";
import { landSoort, normaliseerLand } from "@/lib/onboarding/buitenland";
import { WERKRUIMTES } from "@/lib/werkgever/werkruimte";

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
    /** For type=bedrijf: land van het bedrijf (ISO). Leeg of NL: Nederland, met KVK zoals altijd. */
    land: z
      .string()
      .trim()
      .max(2)
      .refine((s) => landSoort(s) !== null, "Kies een land uit de lijst.")
      .optional(),
    /** For type=freelancer: the worker form (drives the fiscal onboarding). */
    workerKind: z.enum(["zzp", "flexwerker", "uitzendkracht"]).optional(),
    /** For type=bedrijf: het dashboard waarmee het bedrijf begint (lib/werkgever/werkruimte.ts). Zonder: personeel. */
    dashboard: z.enum(WERKRUIMTES, { message: "Kies waarvoor je ZekerFlex gebruikt." }).optional(),
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

  const { userId, tenantId } = await prisma.$transaction(async (tx): Promise<{ userId: string; tenantId: string | null }> => {
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
      return { userId: user.id, tenantId: null };
    }

    // Een bedrijf buiten Nederland heeft geen KVK-nummer: land onthouden, de rest vult de onboarding aan.
    const land = normaliseerLand(input.land);
    let kvk = land === "NL" && input.kvkNumber && input.kvkNumber.length === 8 ? input.kvkNumber : null;
    if (kvk) {
      const clash = await tx.tenant.findFirst({ where: { kvkNumber: kvk }, select: { id: true } });
      if (clash) kvk = null; // already claimed — keep the name, drop the number
    }
    const tenant = await tx.tenant.create({
      data: {
        name: input.companyName!,
        type: "ENTERPRISE_HQ",
        country: land,
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
    return { userId: user.id, tenantId: tenant.id };
  });

  // Het dashboard waarmee het bedrijf opent (website, webshop, rijschool, horeca of personeel). Een storing
  // in KV mag het aanmelden nooit laten mislukken: dan opent het bedrijf in het dashboard personeel.
  // Los ingeladen, zoals de funnel hieronder: ook een fout bij het inladen valt dan binnen de catch.
  const dashboard = tenantId ? (input.dashboard ?? "personeel") : null;
  if (tenantId && dashboard) {
    await import("@/lib/werkgever/werkruimte-server")
      .then(({ voegDashboardToe }) => voegDashboardToe(tenantId, dashboard))
      .catch(() => undefined);
  }

  await recordAudit({
    category: "AUTH",
    action: "auth.register",
    actorUserId: userId,
    actorLabel: "user",
    summary: `Nieuw ${input.type}-account aangemaakt: ${email}`,
    targetType: "user",
    targetId: userId,
    metadata: { type: input.type, ...(dashboard ? { dashboard } : {}) },
  });

  // Save the chosen worker form before registration returns so onboarding can read it.
  if (input.type === "freelancer" && input.workerKind) {
    await setFiscal(userId, { workerKind: input.workerKind }).catch(() => undefined);
  }

  // The welcome mail is NOT sent here: it goes out once the e-mail address is
  // confirmed with the code/link (lib/auth/email-verify.ts), so new users don't
  // get two mails at once.

  void import("@/lib/analytics/funnel")
    .then(({ recordFunnel }) => recordFunnel(input.type === "freelancer" ? "onboarding-werknemer" : "onboarding-opdrachtgever", "aangemeld"))
    .catch(() => undefined);

  return { userId, type: input.type, email };
}
