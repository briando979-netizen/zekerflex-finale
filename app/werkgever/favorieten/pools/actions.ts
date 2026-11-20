"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { createPool, renamePool, deletePool, addMember, removeMember, setPoolAutoAccept } from "@/lib/pools/store";
import { getDict } from "@/lib/i18n/server";
import { nl as nlDict } from "@/lib/i18n/dictionaries";

export interface PoolActionResult {
  ok: boolean;
  message: string;
}

/** De meldingen in de taal van de werkgever; buiten een verzoek (of bij een storing) de Nederlandse standaard. */
const teksten = async () => (await getDict().catch(() => nlDict)).pools;

/** De fouten uit lib/pools/store.ts in de taal van de werkgever: 404 = de groep bestaat niet (meer), 422 = de naam is leeg. */
function foutTekst(err: AppError, p: { notFound: string; nameRequired: string }): string {
  if (err.status === 404) return p.notFound;
  if (err.status === 422) return p.nameRequired;
  return err.message;
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
  const p = await teksten();
  try {
    const t = await tenantId();
    await createPool(t, name);
    return done(p.created);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: foutTekst(err, p) };
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
    if (err instanceof AppError) return { ok: false, message: foutTekst(err, p) };
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
    if (err instanceof AppError) return { ok: false, message: foutTekst(err, p) };
    return { ok: false, message: p.deleteFailed };
  }
}

/** Vaste schil aan of uit (lib/pools/vaste-schil.ts): leden staan direct ingepland als ze reageren tegen het geplaatste tarief. */
export async function setPoolAutoAcceptAction(poolId: string, autoAccept: boolean): Promise<PoolActionResult> {
  const p = await teksten();
  try {
    const t = await tenantId();
    await setPoolAutoAccept(t, poolId, autoAccept);
    return done(autoAccept ? p.vasteSchilAan : p.vasteSchilUit);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: foutTekst(err, p) };
    return { ok: false, message: p.vasteSchilMislukt };
  }
}

export async function addPoolMemberAction(poolId: string, freelancerUserId: string): Promise<PoolActionResult> {
  const p = await teksten();
  try {
    const t = await tenantId();
    await addMember(t, poolId, freelancerUserId);
    return done(p.memberAdded);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: foutTekst(err, p) };
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
    if (err instanceof AppError) return { ok: false, message: foutTekst(err, p) };
    return { ok: false, message: p.deleteFailed };
  }
}
