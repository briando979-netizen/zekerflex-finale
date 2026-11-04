"use server";

import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendVerificationEmail, confirmVerificationCode } from "@/lib/auth/email-verify";
import { smtpConfigured } from "@/lib/mail";
import { revokeTokensFor } from "@/lib/mail/store";
import { fixedWindow, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export interface ResendState {
  message: string | null;
  link: string | null;
  code: string | null;
}

export async function resendVerificationAction(): Promise<ResendState> {
  const principal = await getPrincipal();
  if (!principal) return { message: "Log opnieuw in om een nieuwe code te ontvangen.", link: null, code: null };

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { email: true, fullName: true, emailVerifiedAt: true },
  });
  if (!user) return { message: "Account niet gevonden.", link: null, code: null };
  if (user.emailVerifiedAt) return { message: "Je e-mailadres is al bevestigd.", link: null, code: null };

  const res = await sendVerificationEmail(principal.userId, user.email, user.fullName);
  if (!res.sent) {
    return {
      message: `Wacht nog ${res.cooldownSeconds ?? 30} seconden voordat je opnieuw een code aanvraagt.`,
      link: null,
      code: null,
    };
  }
  const how = res.delivered
    ? `Nieuwe code verstuurd naar ${user.email}.`
    : res.transport === "smtp"
      ? `Aangemaakt voor ${user.email}, maar de mailserver antwoordde niet — gebruik de code/link hieronder.`
      : `Aangemaakt voor ${user.email}. Er is nog geen mailserver, dus gebruik de code/link hieronder.`;
  const showLocal = !res.delivered || !smtpConfigured();
  return {
    message: how,
    link: showLocal ? res.link : null,
    code: showLocal ? res.code ?? null : null,
  };
}

export interface ChangeEmailState {
  error: string | null;
  /** het nieuwe adres, als het is aangepast */
  ok: string | null;
  /** de nieuwe code is nog niet verstuurd (wachttijd): gebruik straks "Stuur de code opnieuw" */
  wacht?: boolean;
}

/**
 * Verkeerd e-mailadres ingetypt bij het aanmelden? Dan kwam de code nooit aan en
 * zat je vast (4 nov 2026: echte accounts die nooit bevestigden). Alleen zolang
 * het adres nog niet bevestigd is; oude codes en links worden ongeldig, zodat
 * wie de mail op het verkeerde adres kreeg het account niet kan bevestigen.
 */
export async function changeEmailAction(_prev: ChangeEmailState, formData: FormData): Promise<ChangeEmailState> {
  const principal = await getPrincipal();
  if (!principal) return { error: "Log opnieuw in om je e-mailadres aan te passen.", ok: null };

  const parsed = z.string().trim().toLowerCase().email().max(160).safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Vul een geldig e-mailadres in.", ok: null };
  const email = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { email: true, fullName: true, emailVerifiedAt: true },
  });
  if (!user) return { error: "Account niet gevonden.", ok: null };
  if (user.emailVerifiedAt) return { error: "Je e-mailadres is al bevestigd. Een ander adres kies je in je accountinstellingen.", ok: null };
  if (email === user.email) return { error: "Dat is hetzelfde adres. Gebruik \"Stuur de code opnieuw\".", ok: null };

  const gate = await fixedWindow(`email-wijzig:rl:${privateRateLimitIdentifier(principal.userId)}`, 5, 3600);
  if (!gate.ok) return { error: "Je hebt je adres al een paar keer aangepast. Probeer het over een uur opnieuw.", ok: null };

  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) return { error: "Er bestaat al een account met dit e-mailadres. Log daarmee in.", ok: null };

  try {
    await prisma.user.update({ where: { id: principal.userId }, data: { email } });
  } catch {
    return { error: "Er bestaat al een account met dit e-mailadres. Log daarmee in.", ok: null };
  }
  await revokeTokensFor(principal.userId);
  await recordAudit({
    category: "AUTH",
    action: "auth.email.changed-before-verify",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `E-mailadres vóór bevestiging aangepast (nu @${email.split("@")[1] ?? ""})`,
    targetType: "user",
    targetId: principal.userId,
  });

  const res = await sendVerificationEmail(principal.userId, email, user.fullName).catch(() => null);
  return { error: null, ok: email, ...(res?.sent ? {} : { wacht: true }) };
}

export interface CodeState {
  error: string | null;
}

export async function confirmCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const principal = await getPrincipal();
  if (!principal) return { error: "Log opnieuw in om je account te bevestigen." };

  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { error: "Vul de 6-cijferige code uit de e-mail in." };

  const result = await confirmVerificationCode(principal.userId, code);
  if (!result.ok) return { error: result.reason ?? "Bevestigen lukte niet." };

  redirect("/start");
}
