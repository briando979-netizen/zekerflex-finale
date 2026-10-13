"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { createPool, renamePool, deletePool, addMember, removeMember } from "@/lib/pools/store";

export interface PoolActionResult {
  ok: boolean;
  message: string;
}

async function tenantId(): Promise<string> {
  const principal = await requirePrincipal();
  requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
  const scope = await resolveEmployerScope(principal);
  const id = scope.tenantIds[0];
  if (!id) throw AppError.forbidden("Geen organisatie gevonden.");
  return id;
}

function done(message: string): PoolActionResult {
  revalidatePath("/werkgever/favorieten/pools");
  revalidatePath("/werkgever/diensten/nieuw");
  return { ok: true, message };
}

export async function createPoolAction(name: string): Promise<PoolActionResult> {
  try {
    const t = await tenantId();
    await createPool(t, name);
    return done("Pool aangemaakt.");
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Pool aanmaken mislukt." };
  }
}

export async function renamePoolAction(poolId: string, name: string): Promise<PoolActionResult> {
  try {
    const t = await tenantId();
    await renamePool(t, poolId, name);
    return done("Pool hernoemd.");
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Hernoemen mislukt." };
  }
}

export async function deletePoolAction(poolId: string): Promise<PoolActionResult> {
  try {
    const t = await tenantId();
    await deletePool(t, poolId);
    return done("Pool verwijderd.");
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Verwijderen mislukt." };
  }
}

export async function addPoolMemberAction(poolId: string, freelancerUserId: string): Promise<PoolActionResult> {
  try {
    const t = await tenantId();
    await addMember(t, poolId, freelancerUserId);
    return done("Toegevoegd aan de pool.");
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Toevoegen mislukt." };
  }
}

export async function removePoolMemberAction(poolId: string, freelancerUserId: string): Promise<PoolActionResult> {
  try {
    const t = await tenantId();
    await removeMember(t, poolId, freelancerUserId);
    return done("Verwijderd uit de pool.");
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Verwijderen mislukt." };
  }
}
