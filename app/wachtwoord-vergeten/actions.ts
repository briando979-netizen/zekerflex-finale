"use server";

import { z } from "zod";
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
  await requestPasswordReset(parsed.data.email).catch(() => undefined);
  // Always report success — no user enumeration.
  return { done: true, error: null };
}
