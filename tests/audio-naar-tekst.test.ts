import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_MAX_BYTES, audioBestandFout, duurTekst, extensieVan, isAudioTaal, tekstBestandsnaam } from "@/lib/asr/bestand";

describe("welke opnames Audio naar tekst aanneemt", () => {
  it("neemt gewone geluidsbestanden en een WhatsApp-spraakbericht aan", () => {
    expect(audioBestandFout("PTT-20261109-WA0003.opus", "audio/ogg", 40_000)).toBeNull();
    expect(audioBestandFout("vergadering.m4a", "", 5_000_000)).toBeNull();
    expect(audioBestandFout("filmpje.mp4", "video/mp4", 20_000_000)).toBeNull();
    expect(audioBestandFout("opname", "audio/webm", 1_000)).toBeNull();
  });

  it("weigert een leeg, te groot of ander bestand, met een Nederlandse uitleg", () => {
    expect(audioBestandFout("leeg.mp3", "audio/mpeg", 0)).toMatch(/leeg/);
    expect(audioBestandFout("lang.mp3", "audio/mpeg", AUDIO_MAX_BYTES + 1)).toMatch(/te groot/);
    expect(audioBestandFout("factuur.pdf", "application/pdf", 10_000)).toMatch(/geen geluids/);
  });

  it("kent alleen de talen uit de lijst", () => {
    expect(isAudioTaal("nl")).toBe(true);
    expect(isAudioTaal("uk")).toBe(true);
    expect(isAudioTaal("xx")).toBe(false);
    expect(isAudioTaal("constructor")).toBe(false);
    expect(isAudioTaal(null)).toBe(false);
  });

  it("opmaak van extensie, duur en bestandsnaam", () => {
    expect(extensieVan("Spraak.OPUS")).toBe("opus");
    expect(extensieVan("zonderpunt")).toBe("");
    expect(duurTekst(8_400)).toBe("8 s");
    expect(duurTekst(65_000)).toBe("1 min 05 s");
    expect(tekstBestandsnaam("PTT-20261109-WA0003.opus")).toBe("PTT-20261109-WA0003.txt");
    expect(tekstBestandsnaam("<script>.mp3")).toBe("script.txt");
    expect(tekstBestandsnaam(".mp3")).toBe("opname.txt");
  });
});

const { transcribeAudio } = vi.hoisted(() => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/asr/transcribe", () => ({ transcribeAudio }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/auth/handlers", () => ({
  withAdminAccess: (_roles: string[], handler: (req: Request, ctx: { principal: { userId: string } }) => Promise<Response>) => (req: Request) =>
    handler(req, { principal: { userId: "admin-1" } }),
}));

const { POST } = await import("@/app/api/admin/audio-tekst/route");

function verzoek(form: FormData): Request {
  return new Request("http://localhost/api/admin/audio-tekst", { method: "POST", body: form });
}

describe("POST /api/admin/audio-tekst", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stuurt de opname met taal en woordenlijst naar onze eigen Whisper en geeft de tekst terug", async () => {
    transcribeAudio.mockResolvedValue({ text: "De dienst begint morgen om negen uur.", language: "nl", durationMs: 1200 });
    const form = new FormData();
    form.append("audio", new File([new Uint8Array([1, 2, 3])], "spraak.opus", { type: "audio/ogg" }));
    form.append("taal", "nl");
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(verzoek(form));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tekst: "De dienst begint morgen om negen uur.", taal: "nl", ms: 1200 });
    const [buf, naam, opts] = transcribeAudio.mock.calls[0] ?? [];
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(naam).toBe("spraak.opus");
    expect(opts).toMatchObject({ language: "nl", prompt: expect.stringContaining("ZekerFlex") });
  });

  it("een onbekende taal wordt Nederlands; een verkeerd bestand komt niet bij Whisper", async () => {
    transcribeAudio.mockResolvedValue({ text: "x", language: "nl", durationMs: 1 });
    const goed = new FormData();
    goed.append("audio", new File([new Uint8Array([1])], "a.mp3", { type: "audio/mpeg" }));
    goed.append("taal", "constructor");
    await (POST as unknown as (r: Request) => Promise<Response>)(verzoek(goed));
    expect(transcribeAudio.mock.calls[0]?.[2]).toMatchObject({ language: "nl" });

    transcribeAudio.mockClear();
    const fout = new FormData();
    fout.append("audio", new File([new Uint8Array([1])], "factuur.pdf", { type: "application/pdf" }));
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(verzoek(fout));
    expect(res.status).toBe(422);
    expect(transcribeAudio).not.toHaveBeenCalled();

    const leeg = await (POST as unknown as (r: Request) => Promise<Response>)(verzoek(new FormData()));
    expect(leeg.status).toBe(400);
  });
});
