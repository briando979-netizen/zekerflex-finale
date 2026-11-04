"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth";
import { dismissWorkItem, dismissWorkItems } from "@/lib/prefs/store";

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

/** "Alles verbergen": every klus you were not chosen for, in one go instead of one by one. */
export async function dismissWorkItemsAction(workKeys: string[]): Promise<DismissResult> {
  try {
    const principal = await requirePrincipal();
    // only card keys (o:<offer>, nm:<match>, …), never more than the list can hold
    const keys = workKeys.filter((k) => typeof k === "string" && /^[a-z]{1,3}:[A-Za-z0-9_-]{1,64}$/.test(k)).slice(0, 200);
    await dismissWorkItems(principal.userId, keys);
    revalidatePath("/dashboard/diensten");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
