"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { createPool, renamePool, deletePool, addMember, removeMember } from "@/lib/pools/store";
import { getDict } from "@/lib/i18n/server";
import { nl as nlDict } from "@/lib/i18n/dictionaries";

export interface PoolActionResult {
  ok: boolean;
  message: string;
}

/** De meldingen in de taal van de werkgever; buiten een verzoek (of bij een storing) de Nederlandse standaard. */
const teksten = async () => (await getDict().catch(() => nlDict)).pools;

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
  const p = await teksten();
  try {
    const t = await tenantId();
    await createPool(t, name);
    return done(p.created);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: p.createFailed };
  }
}

export async function renamePoolAction(poolId: string, name: string): Promise<PoolActionResult> {
  const p = await teksten();
  try {
    const t = await tenantId();
    await renamePool(t, poolId, name);
    return done(p.renamed);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: p.renameFailed };
  }
}

export async function deletePoolAction(poolId: string): Promise<PoolActionResult> {
  const p = await teksten();
  try {
    const t = await tenantId();
    await deletePool(t, poolId);
    return done(p.deleted);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: p.deleteFailed };
  }
}

export async function addPoolMemberAction(poolId: string, freelancerUserId: string): Promise<PoolActionResult> {
  const p = await teksten();
  try {
    const t = await tenantId();
    await addMember(t, poolId, freelancerUserId);
    return done(p.memberAdded);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: p.addFailed };
  }
}

export async function removePoolMemberAction(poolId: string, freelancerUserId: string): Promise<PoolActionResult> {
  const p = await teksten();
  try {
    const t = await tenantId();
    await removeMember(t, poolId, freelancerUserId);
    return done(p.memberRemoved);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: p.deleteFailed };
  }
}
