import { kvGet, kvSet } from "@/lib/storage/kv";
import { recordAudit } from "@/lib/audit";
import { adminFullAccess } from "@/lib/auth/admin-access";
import type { Principal } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Kosteloze accounts. De eigenaar geeft een account — en de bedrijven waar dat
// account beheerder van is — elke betaalde functie voor € 0: Website-beheer,
// websites publiceren, het hoogste API-pakket, telefonie en de bemiddelingsfee
// per uur. Dat is geen beheerdersrecht (lib/auth/admin-access): een kosteloos
// account ziet niets van andere klanten.
//   KV "comp-accounts" → { users: { [userId]: CompEntry } }
// ---------------------------------------------------------------------------

export interface CompEntry {
  userId: string;
  email: string;
  /** companies (tenants) this account is HQ admin of when it was made free */
  tenantIds: string[];
  reason: string;
  at: string;
  by: string;
}

interface CompState {
  users: Record<string, CompEntry>;
}

const KEY = "comp-accounts";

async function state(): Promise<CompState> {
  return (await kvGet<CompState>(KEY).catch(() => null)) ?? { users: {} };
}

export async function isCompUser(userId: string): Promise<boolean> {
  return Boolean((await state()).users[userId]);
}

export async function isCompTenant(tenantId: string): Promise<boolean> {
  return Object.values((await state()).users).some((u) => u.tenantIds.includes(tenantId));
}

/** May this person use every paid feature without paying: a platform admin or a free account. */
export async function freeAccess(p: Principal | null | undefined): Promise<boolean> {
  if (!p) return false;
  return adminFullAccess(p) || isCompUser(p.userId);
}

export async function listComp(): Promise<CompEntry[]> {
  return Object.values((await state()).users).sort((a, b) => b.at.localeCompare(a.at));
}

/** Make an account free (or paying again); audited. */
export async function setComp(input: { userId: string; email: string; tenantIds: string[]; on: boolean; reason: string; by: { userId: string; name: string } }): Promise<CompEntry[]> {
  const s = await state();
  if (input.on) {
    s.users[input.userId] = { userId: input.userId, email: input.email, tenantIds: input.tenantIds, reason: input.reason, at: new Date().toISOString(), by: input.by.name };
  } else {
    delete s.users[input.userId];
  }
  await kvSet(KEY, s);
  await recordAudit({
    category: "ADMIN",
    action: input.on ? "billing.comp.granted" : "billing.comp.revoked",
    actorUserId: input.by.userId,
    summary: `${input.email} ${input.on ? "krijgt alle betaalde functies voor € 0" : "betaalt weer gewoon"}${input.reason ? ` (${input.reason})` : ""}`,
    targetType: "user",
    targetId: input.userId,
  });
  return listComp();
}
