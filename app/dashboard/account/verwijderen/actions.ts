"use server";

import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { signOut } from "@/lib/auth/nextauth";
import { anonymizeUser } from "@/lib/privacy/anonymize";

export interface DeleteOwnAccountState {
  error: string | null;
}

export async function deleteOwnAccountAction(
  _prev: DeleteOwnAccountState,
  formData: FormData,
): Promise<DeleteOwnAccountState> {
  const principal = await requirePrincipal();

  const parsed = z.object({ confirmText: z.string() }).safeParse({
    confirmText: formData.get("confirmText"),
  });
  if (!parsed.success || parsed.data.confirmText.trim().toUpperCase() !== "VERWIJDEREN") {
    return { error: 'Typ precies "VERWIJDEREN" om te bevestigen.' };
  }

  await anonymizeUser(principal.userId, {
    actorUserId: principal.userId,
    reason: "zelf verwijderd via app",
  });

  await signOut({ redirectTo: "/account-verwijderen/voltooid" });
  return { error: null };
}
