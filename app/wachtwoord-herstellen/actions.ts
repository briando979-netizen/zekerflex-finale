"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { completePasswordReset } from "@/lib/auth/password-reset";

export interface ResetState {
  error: string | null;
}

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = z
    .object({
      token: z.string().min(16).max(64),
      password: z.string().min(8, "Kies een wachtwoord van minstens 8 tekens."),
      confirm: z.string(),
    })
    .safeParse({
      token: formData.get("token"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Controleer je invoer." };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { error: "De wachtwoorden komen niet overeen." };
  }

  const res = await completePasswordReset(parsed.data.token, parsed.data.password);
  if (!res.ok) return { error: res.reason ?? "Herstellen mislukt." };

  redirect("/login?reset=1");
}
