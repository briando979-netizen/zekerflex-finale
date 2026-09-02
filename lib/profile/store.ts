import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Presentational profile extras that don't belong in the core schema:
//  - a user's avatar (an Upload id)
//  - an organisation's public website + photo + short description
// Filesystem only. The avatar is auto-used everywhere a user is shown.
//   storage/profile/users/<userId>.json
//   storage/profile/orgs/<tenantId>.json
// ---------------------------------------------------------------------------

export interface UserProfileExtra {
  avatarUploadId?: string;
  headline?: string; // e.g. "Ervaren barista · Amsterdam"
  updatedAt?: string;
}

export interface OrgProfileExtra {
  websiteUrl?: string;
  photoUploadId?: string;
  about?: string;
  /** where invoices are e-mailed (defaults to the account e-mail when empty) */
  billingEmail?: string;
  /** receive a separate invoice per cost centre / PO number instead of one collective invoice */
  splitByCostCentre?: boolean;
  /** the PO numbers / cost centres selectable when placing a shift */
  costCentres?: string[];
  /** employer onboarding wizard answers + which steps are marked done */
  onboarding?: {
    role?: string;
    sector?: string;
    shortageFrequency?: string;
    urgency?: string;
    priorPlatform?: string;
    profileStepDone?: boolean;
    completedAt?: string;
  };
  updatedAt?: string;
}

const usersDir = () => join(process.cwd(), "storage", "profile", "users");
const orgsDir = () => join(process.cwd(), "storage", "profile", "orgs");
const clean = (id: string) => id.replace(/[^a-z0-9-]/gi, "");

async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function getUserProfileExtra(userId: string): Promise<UserProfileExtra> {
  return readJson<UserProfileExtra>(join(usersDir(), `${clean(userId)}.json`), {});
}

export async function saveUserProfileExtra(
  userId: string,
  patch: Partial<UserProfileExtra>,
): Promise<UserProfileExtra> {
  const current = await getUserProfileExtra(userId);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await mkdir(usersDir(), { recursive: true });
  await writeFile(join(usersDir(), `${clean(userId)}.json`), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function removeUserAvatar(userId: string): Promise<void> {
  const current = await getUserProfileExtra(userId);
  const { avatarUploadId, ...rest } = current;
  void avatarUploadId;
  await mkdir(usersDir(), { recursive: true });
  await writeFile(
    join(usersDir(), `${clean(userId)}.json`),
    JSON.stringify({ ...rest, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

export async function getUserAvatars(userIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    [...new Set(userIds.filter(Boolean))].map(async (id) => {
      const extra = await getUserProfileExtra(id);
      if (extra.avatarUploadId) out[id] = extra.avatarUploadId;
    }),
  );
  return out;
}

export async function getOrgProfileExtra(tenantId: string): Promise<OrgProfileExtra> {
  return readJson<OrgProfileExtra>(join(orgsDir(), `${clean(tenantId)}.json`), {});
}

export async function saveOrgProfileExtra(
  tenantId: string,
  patch: Partial<OrgProfileExtra>,
): Promise<OrgProfileExtra> {
  const current = await getOrgProfileExtra(tenantId);
  const next: OrgProfileExtra = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (next.websiteUrl && !/^https?:\/\//i.test(next.websiteUrl)) {
    next.websiteUrl = `https://${next.websiteUrl}`;
  }
  await mkdir(orgsDir(), { recursive: true });
  await writeFile(join(orgsDir(), `${clean(tenantId)}.json`), JSON.stringify(next, null, 2), "utf8");
  return next;
}
