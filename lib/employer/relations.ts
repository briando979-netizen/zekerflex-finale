import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Per-organisation freelancer relations — favourites and blocks.
// Filesystem only (same non-destructive pattern as prefs / replacements):
//   storage/employer-relations/<tenantId>.json
//
// favourites  → krachten die je graag terugziet (voor snel uitnodigen)
// blocked     → krachten die je klussen niet meer mogen zien of aannemen
// ---------------------------------------------------------------------------

export interface FreelancerRef {
  userId: string;
  name: string;
  at: string;
  note?: string;
}

export interface EmployerRelations {
  favorites: FreelancerRef[];
  blocked: FreelancerRef[];
}

const EMPTY: EmployerRelations = { favorites: [], blocked: [] };

function dir(): string {
  return join(process.cwd(), "storage", "employer-relations");
}
function file(tenantId: string): string {
  return join(dir(), `${tenantId.replace(/[^a-zA-Z0-9_-]/g, "")}.json`);
}

export async function getEmployerRelations(tenantId: string): Promise<EmployerRelations> {
  const p = file(tenantId);
  if (!existsSync(p)) return { favorites: [], blocked: [] };
  try {
    const raw = JSON.parse(await readFile(p, "utf8")) as Partial<EmployerRelations>;
    return {
      favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
      blocked: Array.isArray(raw.blocked) ? raw.blocked : [],
    };
  } catch {
    return { favorites: [], blocked: [] };
  }
}

async function write(tenantId: string, rel: EmployerRelations): Promise<EmployerRelations> {
  await mkdir(dir(), { recursive: true });
  await writeFile(file(tenantId), JSON.stringify(rel, null, 2), "utf8");
  return rel;
}

export type RelationAction = "favorite" | "unfavorite" | "block" | "unblock";

export async function updateEmployerRelation(
  tenantId: string,
  action: RelationAction,
  ref: { userId: string; name: string; note?: string },
): Promise<EmployerRelations> {
  const rel = await getEmployerRelations(tenantId);
  const entry: FreelancerRef = {
    userId: ref.userId,
    name: ref.name,
    at: new Date().toISOString(),
    ...(ref.note ? { note: ref.note.slice(0, 300) } : {}),
  };

  if (action === "favorite") {
    rel.favorites = [entry, ...rel.favorites.filter((f) => f.userId !== ref.userId)];
  } else if (action === "unfavorite") {
    rel.favorites = rel.favorites.filter((f) => f.userId !== ref.userId);
  } else if (action === "block") {
    rel.blocked = [entry, ...rel.blocked.filter((b) => b.userId !== ref.userId)];
    rel.favorites = rel.favorites.filter((f) => f.userId !== ref.userId);
  } else if (action === "unblock") {
    rel.blocked = rel.blocked.filter((b) => b.userId !== ref.userId);
  }

  return write(tenantId, rel);
}

/** userIds blocked by ANY of the given tenants — for excluding shifts from a freelancer's marketplace. */
export async function blockedUserIdsForTenants(tenantIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(
    tenantIds.map(async (t) => {
      const rel = await getEmployerRelations(t);
      for (const b of rel.blocked) out.add(b.userId);
    }),
  );
  return out;
}

/** Does any of these tenants block this freelancer? */
export async function isBlockedByAny(tenantIds: string[], userId: string): Promise<boolean> {
  for (const t of tenantIds) {
    const rel = await getEmployerRelations(t);
    if (rel.blocked.some((b) => b.userId === userId)) return true;
  }
  return false;
}

/** Of the given tenants, which ones have this freelancer blocked. */
export async function tenantsBlockingUser(
  tenantIds: string[],
  userId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(
    [...new Set(tenantIds)].map(async (t) => {
      const rel = await getEmployerRelations(t);
      if (rel.blocked.some((b) => b.userId === userId)) out.add(t);
    }),
  );
  return out;
}
