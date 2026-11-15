import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Per-account chat preferences — quick replies, an away / auto-reply message,
// and privacy toggles. Postgres-backed (KeyValueStore, key
// "chat-settings:<userId>") — was local disk, unreliable on Vercel serverless.
// ---------------------------------------------------------------------------

export interface AutoReply {
  enabled: boolean;
  text: string;
  /** only fire outside the user's active hours (quiet hours) */
  onlyWhenAway: boolean;
}

export interface ChatSettings {
  quickReplies: string[];
  autoReply: AutoReply;
  showReadReceipts: boolean;
  showOnlineStatus: boolean;
  /** message shown on your profile card */
  statusNote: string;
  /** show the message text in push notifications (off = "Nieuw bericht") */
  notificationPreview: boolean;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  quickReplies: [
    "Ja, ik kom!",
    "Ik laat het je zo snel mogelijk weten.",
    "Kun je meer details sturen?",
    "Bedankt, tot dan!",
  ],
  autoReply: { enabled: false, text: "Bedankt voor je bericht — ik reageer zo snel mogelijk.", onlyWhenAway: true },
  showReadReceipts: true,
  showOnlineStatus: true,
  statusNote: "",
  notificationPreview: true,
};

/**
 * Voor bedrijven (de zakelijke weergave, lib/chat/zakelijk.ts): snelle antwoorden en een afwezigheidsbericht die bij een
 * opdrachtgever passen, zolang het bedrijf ze niet zelf aanpaste. De chat van een opdrachtgever is Nederlands.
 */
export const ZAKELIJK_STANDAARD: Pick<ChatSettings, "quickReplies" | "autoReply"> = {
  quickReplies: [
    "Bedankt voor je bericht! We reageren zo snel mogelijk.",
    "Kun je morgen om 9:00 beginnen?",
    "Je aanmelding is goedgekeurd, welkom!",
    "Vergeet niet je uren in te vullen in de app.",
    "Kun je je beschikbaarheid voor volgende week doorgeven?",
  ],
  autoReply: { enabled: false, text: "Bedankt voor je bericht! We zijn nu niet bereikbaar en reageren zo snel mogelijk.", onlyWhenAway: true },
};

export interface ChatSettingsOpties {
  /** een bedrijf (lib/messaging/zakelijk-rol.ts): zakelijke standaarden */
  zakelijk?: boolean;
}

const key = (userId: string) => `chat-settings:${userId}`;

export async function getChatSettings(userId: string, opties: ChatSettingsOpties = {}): Promise<ChatSettings> {
  const basis: ChatSettings = opties.zakelijk ? { ...DEFAULT_SETTINGS, ...ZAKELIJK_STANDAARD } : DEFAULT_SETTINGS;
  const raw = await kvGet<Partial<ChatSettings>>(key(userId));
  if (!raw) return { ...basis };
  return {
    ...basis,
    ...raw,
    autoReply: { ...basis.autoReply, ...(raw.autoReply ?? {}) },
    quickReplies: Array.isArray(raw.quickReplies) ? raw.quickReplies.slice(0, 20) : basis.quickReplies,
  };
}

export interface ChatSettingsPatch {
  quickReplies?: string[] | undefined;
  autoReply?:
    | { enabled?: boolean | undefined; text?: string | undefined; onlyWhenAway?: boolean | undefined }
    | undefined;
  showReadReceipts?: boolean | undefined;
  showOnlineStatus?: boolean | undefined;
  statusNote?: string | undefined;
  notificationPreview?: boolean | undefined;
}

export async function saveChatSettings(
  userId: string,
  patch: ChatSettingsPatch,
  opties: ChatSettingsOpties = {},
): Promise<ChatSettings> {
  const current = await getChatSettings(userId, opties);
  const ar = patch.autoReply ?? {};
  const next: ChatSettings = {
    quickReplies: (patch.quickReplies ?? current.quickReplies)
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, 20),
    autoReply: {
      enabled: ar.enabled ?? current.autoReply.enabled,
      text: (ar.text ?? current.autoReply.text).slice(0, 600),
      onlyWhenAway: ar.onlyWhenAway ?? current.autoReply.onlyWhenAway,
    },
    showReadReceipts: patch.showReadReceipts ?? current.showReadReceipts,
    showOnlineStatus: patch.showOnlineStatus ?? current.showOnlineStatus,
    statusNote: (patch.statusNote ?? current.statusNote).slice(0, 140),
    notificationPreview: patch.notificationPreview ?? current.notificationPreview ?? true,
  };
  await kvSet(key(userId), next);
  return next;
}

/**
 * Privacy as WhatsApp does it: whoever hides their online status shows
 * nobody theirs; whoever turns read receipts off neither sends nor sees them.
 */
export async function chatPrivacy(userIds: string[]): Promise<{ hideOnline: Set<string>; noReceipts: Set<string>; noPreview: Set<string> }> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const all = await Promise.all(ids.map(async (id) => [id, await getChatSettings(id)] as const));
  return {
    hideOnline: new Set(all.filter(([, s]) => !s.showOnlineStatus).map(([id]) => id)),
    noReceipts: new Set(all.filter(([, s]) => !s.showReadReceipts).map(([id]) => id)),
    noPreview: new Set(all.filter(([, s]) => s.notificationPreview === false).map(([id]) => id)),
  };
}
