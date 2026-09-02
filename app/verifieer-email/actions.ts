"use server";

import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, confirmVerificationCode } from "@/lib/auth/email-verify";
import { smtpConfigured } from "@/lib/mail";

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
