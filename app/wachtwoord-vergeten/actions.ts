"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { requestPasswordReset } from "@/lib/auth/password-reset";

export interface ForgotState {
  done: boolean;
  error: string | null;
}

export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const parsed = z.object({ email: z.string().email() }).safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { done: false, error: "Vul een geldig e-mailadres in." };
  }
  const kop = await headers();
  const ip = kop.get("x-forwarded-for")?.split(",")[0]?.trim() || kop.get("x-real-ip")?.trim() || "local";
  await requestPasswordReset(parsed.data.email, ip).catch(() => undefined);
  // Always report success — no user enumeration.
  return { done: true, error: null };
}
