import { afterEach, describe, expect, it, vi } from "vitest";

const sendUserPush = vi.fn();
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...a) }));

const visibleUsers = vi.fn();
vi.mock("@/lib/messaging/presence", () => ({ visibleUsers: (...a: unknown[]) => visibleUsers(...a) }));

const platformAdminIds = vi.fn();
vi.mock("@/lib/messaging/contacts", () => ({
  userDirectory: async (ids: string[]) =>
    new Map(ids.map((id) => [id, { userId: id, name: id === "u_jan" ? "Jan de Vries" : "Bakkerij Bol", role: "employer" }])),
  platformAdminIds: (...a: unknown[]) => platformAdminIds(...a),
}));

// het plafond voor groepsmeldingen (Redis): hier altijd vrij, behalve waar een test het anders zet
const claimIdempotency = vi.fn(async (..._a: unknown[]) => true);
vi.mock("@/lib/redis", () => ({ claimIdempotency: (...a: unknown[]) => claimIdempotency(...a) }));

// per-user chat settings: defaults (not muted, message preview on)
vi.mock("@/lib/messaging/thread-prefs", () => ({
  getChatPrefs: async () => ({ archived: [], muted: {}, locked: [], favorites: [], lists: {}, clearedAt: {}, deletedAt: {}, blocked: [] }),
  isMuted: () => false,
}));
vi.mock("@/lib/messaging/settings", () => ({
  chatPrivacy: async () => ({ hideOnline: new Set(), noReceipts: new Set(), noPreview: new Set() }),
}));

import { notifyIncomingCall, notifyMissedCall, notifyNewMessage } from "@/lib/messaging/notify";
import type { ChatMessage, ChatThread } from "@/lib/messaging/store";

function thread(over: Partial<ChatThread> = {}): ChatThread {
  return {
    id: "t1",
    kind: "direct",
    participants: ["u_jan", "u_bol"],
    createdAt: "2026-10-15T08:00:00.000Z",
    lastMessageAt: "2026-10-15T08:00:00.000Z",
    lastMessage: null,
    meta: {},
    reads: {},
    ...over,
  };
}

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "m1", threadId: "t1", from: "u_jan", at: "2026-10-15T09:00:00.000Z", text: "Kun je morgen om 8 uur?", kind: "text", ...over };
}

afterEach(() => vi.clearAllMocks());

describe("notifyIncomingCall", () => {
  it("rings every device of the callee, briefly, tagged per call", async () => {
    sendUserPush.mockResolvedValue(2);
    await notifyIncomingCall(thread(), "u_jan", "call123", "audio");
    expect(sendUserPush).toHaveBeenCalledWith(["u_bol"], {
      title: "📞 Jan de Vries belt je",
      body: "Tik om op te nemen in ZekerFlex.",
      data: { type: "CALL", url: "/berichten?thread=t1", tag: "call-call123" },
      ttlSeconds: 45,
    });
  });

  it("says when it is a video call", async () => {
    await notifyIncomingCall(thread(), "u_jan", "c2", "video");
    expect(sendUserPush.mock.calls[0]![1].title).toBe("📹 Jan de Vries belt je (video)");
  });
});

describe("notifyMissedCall", () => {
  it("replaces the ringing notification (same tag) and is kept for a day", async () => {
    await notifyMissedCall(thread(), "u_jan", "call123", "audio");
    expect(sendUserPush).toHaveBeenCalledWith(
      ["u_bol"],
      expect.objectContaining({
        title: "Gemiste oproep van Jan de Vries",
        data: { type: "CALL_MISSED", url: "/berichten?thread=t1", tag: "call-call123" },
        ttlSeconds: 86_400,
      }),
    );
  });
});

describe("notifyNewMessage", () => {
  it("pushes a direct message to the other side when they aren't looking", async () => {
    visibleUsers.mockResolvedValue(new Set());
    await notifyNewMessage(thread(), msg());
    expect(sendUserPush).toHaveBeenCalledWith(["u_bol"], {
      title: "Jan de Vries",
      body: "Kun je morgen om 8 uur?",
      data: { type: "CHAT", url: "/berichten?thread=t1", tag: "thread-t1" },
      ttlSeconds: 86_400,
    });
  });

  it("skips a recipient who has ZekerFlex open in view", async () => {
    visibleUsers.mockResolvedValue(new Set(["u_bol"]));
    await notifyNewMessage(thread(), msg());
    expect(sendUserPush).not.toHaveBeenCalled();
  });

  it("previews non-text messages instead of an empty body", async () => {
    visibleUsers.mockResolvedValue(new Set());
    await notifyNewMessage(thread(), msg({ kind: "voice", text: "" }));
    expect(sendUserPush.mock.calls[0]![1].body).toBe("🎤 Spraakbericht");
  });

  it("never pushes call logs, system lines or automatic replies", async () => {
    visibleUsers.mockResolvedValue(new Set());
    await notifyNewMessage(thread(), msg({ kind: "call", text: "" }));
    await notifyNewMessage(thread(), msg({ kind: "system" }));
    await notifyNewMessage(thread(), msg({ auto: true }));
    expect(sendUserPush).not.toHaveBeenCalled();
  });

  it("group: every other member, titled with the group name, body Name: text (13 nov, like WhatsApp)", async () => {
    visibleUsers.mockResolvedValue(new Set(["u_x"]));
    await notifyNewMessage(thread({ kind: "group", participants: ["u_jan", "u_bol", "u_x"], meta: { title: "Team Zaterdag" } }), msg());
    expect(sendUserPush).toHaveBeenCalledTimes(1);
    expect(sendUserPush).toHaveBeenCalledWith(["u_bol"], {
      title: "Team Zaterdag",
      body: "Jan de Vries: Kun je morgen om 8 uur?",
      data: { type: "CHAT", url: "/berichten?thread=t1", tag: "thread-t1" },
      ttlSeconds: 86_400,
    });
  });

  it("group: at most one push per member per 30 s, an @mention always gets through, Redis down = still a push", async () => {
    visibleUsers.mockResolvedValue(new Set());
    const g = thread({ kind: "group", participants: ["u_jan", "u_bol", "u_x"], meta: { title: "Team" } });
    claimIdempotency.mockImplementation(async (key: unknown) => key !== "chat-push:t1:u_x");
    await notifyNewMessage(g, msg());
    expect(sendUserPush.mock.calls[0]![0]).toEqual(["u_bol"]);
    expect(claimIdempotency).toHaveBeenCalledWith("chat-push:t1:u_bol", 30);
    sendUserPush.mockClear();
    await notifyNewMessage(g, msg({ text: "@u_x jij?", mentions: ["u_x"] }));
    expect(sendUserPush.mock.calls[0]![0]).toEqual(["u_bol", "u_x"]);
    sendUserPush.mockClear();
    claimIdempotency.mockImplementation(async () => {
      throw new Error("redis weg");
    });
    await notifyNewMessage(g, msg());
    expect(sendUserPush.mock.calls[0]![0]).toEqual(["u_bol", "u_x"]);
    claimIdempotency.mockImplementation(async () => true);
  });

  it("direct chats have no ceiling (one person, one conversation)", async () => {
    visibleUsers.mockResolvedValue(new Set());
    await notifyNewMessage(thread(), msg());
    expect(claimIdempotency).not.toHaveBeenCalled();
  });

  it("group without a name: the sender as title", async () => {
    visibleUsers.mockResolvedValue(new Set());
    await notifyNewMessage(thread({ kind: "group", participants: ["u_jan", "u_bol"] }), msg());
    expect(sendUserPush.mock.calls[0]![1]).toMatchObject({ title: "Jan de Vries", body: "Jan de Vries: Kun je morgen om 8 uur?" });
  });

  it("support: a user's question goes to the platform admins", async () => {
    visibleUsers.mockResolvedValue(new Set());
    platformAdminIds.mockResolvedValue(["u_admin1", "u_admin2"]);
    await notifyNewMessage(thread({ kind: "support", participants: ["u_jan"] }), msg());
    expect(sendUserPush).toHaveBeenCalledWith(["u_admin1", "u_admin2"], expect.objectContaining({ title: "Jan de Vries" }));
  });

  it("support: the answer goes back to the user, signed as ZekerFlex Support", async () => {
    visibleUsers.mockResolvedValue(new Set());
    await notifyNewMessage(thread({ kind: "support", participants: ["u_jan"] }), msg({ from: "u_admin1", text: "We kijken ernaar." }));
    expect(sendUserPush).toHaveBeenCalledWith(["u_jan"], expect.objectContaining({ title: "ZekerFlex Support", body: "We kijken ernaar." }));
  });

  it("swallows push failures so sending a message never errors", async () => {
    visibleUsers.mockResolvedValue(new Set());
    sendUserPush.mockRejectedValue(new Error("push service down"));
    await expect(notifyNewMessage(thread(), msg())).resolves.toBeUndefined();
  });
});
