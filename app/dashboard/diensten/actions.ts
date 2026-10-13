"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth";
import { dismissWorkItem } from "@/lib/prefs/store";

export interface DismissResult {
  ok: boolean;
}

/** Permanently hides a "Gearchiveerd" card from Mijn klussen — it never resurfaces anywhere. */
export async function dismissWorkItemAction(workKey: string): Promise<DismissResult> {
  try {
    const principal = await requirePrincipal();
    await dismissWorkItem(principal.userId, workKey);
    revalidatePath("/dashboard/diensten");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
