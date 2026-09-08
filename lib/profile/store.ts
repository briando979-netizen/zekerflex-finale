import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Presentational profile extras that don't belong in the core schema:
//  - a user's avatar (an Upload id)
//  - an organisation's public website + photo + short description
// Postgres-backed (KeyValueStore, keys "profile-user:<userId>" /
// "profile-org:<tenantId>") — was local disk, unreliable on Vercel
// serverless. The avatar is auto-used everywhere a user is shown.
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
    coverStepDone?: boolean;
    completedAt?: string;
  };
  updatedAt?: string;
}

const userKey = (userId: string) => `profile-user:${userId}`;
const orgKey = (tenantId: string) => `profile-org:${tenantId}`;

export async function getUserProfileExtra(userId: string): Promise<UserProfileExtra> {
  return (await kvGet<UserProfileExtra>(userKey(userId))) ?? {};
}

export async function saveUserProfileExtra(
  userId: string,
  patch: Partial<UserProfileExtra>,
): Promise<UserProfileExtra> {
  const current = await getUserProfileExtra(userId);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await kvSet(userKey(userId), next);
  return next;
}

export async function removeUserAvatar(userId: string): Promise<void> {
  const current = await getUserProfileExtra(userId);
  const { avatarUploadId, ...rest } = current;
  void avatarUploadId;
  await kvSet(userKey(userId), { ...rest, updatedAt: new Date().toISOString() });
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
  return (await kvGet<OrgProfileExtra>(orgKey(tenantId))) ?? {};
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
  await kvSet(orgKey(tenantId), next);
  return next;
}
