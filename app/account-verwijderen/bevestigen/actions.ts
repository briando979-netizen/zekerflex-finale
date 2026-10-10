"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { confirmAccountDeletion } from "@/lib/privacy/deletion-request";

export interface ConfirmDeletionState {
  error: string | null;
}

export async function confirmAccountDeletionAction(
  _prev: ConfirmDeletionState,
  formData: FormData,
): Promise<ConfirmDeletionState> {
  const parsed = z
    .object({
      token: z.string().min(16).max(64),
      confirmText: z.string(),
    })
    .safeParse({
      token: formData.get("token"),
      confirmText: formData.get("confirmText"),
    });

  if (!parsed.success) {
    return { error: "Controleer je invoer." };
  }
  if (parsed.data.confirmText.trim().toUpperCase() !== "VERWIJDEREN") {
    return { error: 'Typ precies "VERWIJDEREN" om te bevestigen.' };
  }

  const res = await confirmAccountDeletion(parsed.data.token);
  if (!res.ok) return { error: res.reason ?? "Verwijderen mislukt." };

  redirect("/account-verwijderen/voltooid");
}
