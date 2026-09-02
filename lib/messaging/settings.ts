import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Per-account chat preferences — quick replies, an away / auto-reply message,
// and privacy toggles. Filesystem only:  storage/chat-settings/<userId>.json
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
};

const dir = () => join(process.cwd(), "storage", "chat-settings");
const file = (userId: string) => join(dir(), `${userId.replace(/[^a-z0-9-]/gi, "")}.json`);

export async function getChatSettings(userId: string): Promise<ChatSettings> {
  const p = file(userId);
  if (!existsSync(p)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(await readFile(p, "utf8")) as Partial<ChatSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      autoReply: { ...DEFAULT_SETTINGS.autoReply, ...(raw.autoReply ?? {}) },
      quickReplies: Array.isArray(raw.quickReplies) ? raw.quickReplies.slice(0, 20) : DEFAULT_SETTINGS.quickReplies,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export interface ChatSettingsPatch {
  quickReplies?: string[] | undefined;
  autoReply?:
    | { enabled?: boolean | undefined; text?: string | undefined; onlyWhenAway?: boolean | undefined }
    | undefined;
  showReadReceipts?: boolean | undefined;
  showOnlineStatus?: boolean | undefined;
  statusNote?: string | undefined;
}

export async function saveChatSettings(
  userId: string,
  patch: ChatSettingsPatch,
): Promise<ChatSettings> {
  const current = await getChatSettings(userId);
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
  };
  await mkdir(dir(), { recursive: true });
  await writeFile(file(userId), JSON.stringify(next, null, 2), "utf8");
  return next;
}
