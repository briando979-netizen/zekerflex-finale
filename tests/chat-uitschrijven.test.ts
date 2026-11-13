import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 4 (13 nov): een spraakbericht laten uitschrijven, met onze eigen Whisper. De taal herkent
// Whisper zelf (werkers spreken ook Pools, Roemeens en Oekraïens); de tekst komt in het bericht en wordt niet opnieuw
// gemaakt als hij er al is.

const env = vi.hoisted(() => ({ WHISPER_ENABLED: true, WHISPER_BASE_URL: "http://whisper:8000/v1", WHISPER_MODEL: "Systran/faster-whisper-small", WHISPER_API_KEY: undefined as string | undefined, LLM_BASE_URL: "http://ollama:11434/v1" }));
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "a", fullName: "A" }) }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/messaging/media", () => ({
  readChatMedia: async () => ({ bytes: Buffer.from("OggS-spraak"), filename: "spraak.webm", mimeType: "audio/webm" }),
}));

import { transcribeAudio } from "@/lib/asr/transcribe";
import { getMessages, postMessage, setTranscript, type ChatThread } from "@/lib/messaging/store";
import { POST } from "@/app/api/inbox/[threadId]/transcript/route";
import { uitschrijfTijd } from "@/lib/messaging/uitschrijf-tijd";

const whisper = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ text: " Ik ben er om negen uur. " }), { status: 200 }));
const vraag = (messageId: string) =>
  POST(new Request("http://localhost/api/inbox/t1/transcript", { method: "POST", body: JSON.stringify({ messageId }) }), { params: Promise.resolve({ threadId: "t1" }) });
const spraak = () => postMessage("t1", "b", "", "voice", { attachment: { mediaId: "med1", filename: "spraak.webm", mimeType: "audio/webm", sizeBytes: 11, durationSec: 3 } });

beforeEach(() => {
  kv.clear();
  kv.set("chat-thread:t1", { id: "t1", kind: "direct", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} } as ChatThread);
  vi.stubGlobal("fetch", whisper);
});
afterEach(() => {
  vi.unstubAllGlobals();
  whisper.mockClear();
});

describe("Whisper", () => {
  it("language null: Whisper kiest de taal zelf; zonder optie blijft het Nederlands", async () => {
    await transcribeAudio(Buffer.from("x"), "a.webm", { language: null });
    expect((whisper.mock.calls[0]![1].body as FormData).has("language")).toBe(false);
    await transcribeAudio(Buffer.from("x"), "a.webm");
    expect((whisper.mock.calls[1]![1].body as FormData).get("language")).toBe("nl");
  });
});

describe("POST /api/inbox/:id/transcript", () => {
  it("schrijft een spraakbericht uit en bewaart de tekst in het bericht", async () => {
    const m = await spraak();
    const res = await vraag(m.id);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatchObject({ id: m.id, transcript: "Ik ben er om negen uur." });
    expect((await getMessages("t1"))[0]?.transcript).toBe("Ik ben er om negen uur.");
    expect((whisper.mock.calls[0]![1].body as FormData).has("language")).toBe(false);
  });

  it("al uitgeschreven: meteen de bewaarde tekst, Whisper niet opnieuw", async () => {
    const m = await spraak();
    await setTranscript("t1", m.id, "Al klaar.");
    const res = await vraag(m.id);
    expect((await res.json()).message.transcript).toBe("Al klaar.");
    expect(whisper).not.toHaveBeenCalled();
  });

  it("alleen een spraakbericht dat er nog is", async () => {
    const tekst = await postMessage("t1", "b", "gewoon tekst");
    expect((await vraag(tekst.id)).status).toBe(404);
    expect((await vraag("bestaat-niet")).status).toBe(404);
    expect(await setTranscript("t1", tekst.id, "mag niet")).toBeNull();
    expect(whisper).not.toHaveBeenCalled();
  });
});

describe("hoe lang Whisper mag", () => {
  it("45 s plus 3 s per seconde audio, hooguit 240 s; onbekend telt als een minuut", () => {
    // 13 nov gemeten: 1 s audio kostte 15 s
    expect(uitschrijfTijd(1)).toBe(48_000);
    expect(uitschrijfTijd(30)).toBe(135_000);
    expect(uitschrijfTijd(600)).toBe(240_000);
    expect(uitschrijfTijd(undefined)).toBe(225_000);
    expect(uitschrijfTijd(Number.NaN)).toBe(225_000);
    expect(uitschrijfTijd(240_000 / 1000)).toBeLessThan(5 * 60_000); // onder de requestTimeout van Node
  });
});

describe("in de bubbel", () => {
  it("een knop zolang er geen tekst is; daarna de tekst (of 'geen spraak gehoord')", () => {
    const bubbel = readFileSync(path.join(process.cwd(), "components/chat/MessageBubble.tsx"), "utf8").split("\r\n").join("\n");
    expect(bubbel).toContain("{transcript !== undefined ? (");
    expect(bubbel).toContain("{transcript || t.geenSpraak}");
    expect(bubbel).toContain("onTranscribe={onTranscribe && !m.pending ? () => onTranscribe(m) : undefined}");
  });
});
