"use server";

import { z } from "zod";
import { requestAccountDeletion } from "@/lib/privacy/deletion-request";

export interface RequestDeletionState {
  done: boolean;
  error: string | null;
}

export async function requestAccountDeletionAction(
  _prev: RequestDeletionState,
  formData: FormData,
): Promise<RequestDeletionState> {
  const parsed = z.object({ email: z.string().email() }).safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { done: false, error: "Vul een geldig e-mailadres in." };
  }
  await requestAccountDeletion(parsed.data.email).catch(() => undefined);
  // Always report success — no user enumeration.
  return { done: true, error: null };
}
