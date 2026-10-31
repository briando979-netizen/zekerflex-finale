import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord } from "@/lib/telephony/store";

const calls = new Map<string, CallRecord>();

vi.mock("@/lib/telephony/webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telephony/webhook")>()),
  signatureValid: () => true,
}));
vi.mock("@/lib/telephony/store", () => ({
  getCall: vi.fn(async (id: string) => calls.get(id) ?? null),
  addTurn: vi.fn(async (id: string, who: "ai" | "beller", text: string) => {
    calls.get(id)!.transcript.push({ at: "t", who, text });
    return calls.get(id);
  }),
  patchCall: vi.fn(async (id: string, patch: Partial<CallRecord>) => {
    Object.assign(calls.get(id)!, patch);
    return calls.get(id);
  }),
  createCall: vi.fn(),
}));
const chat = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  chat: (...a: unknown[]) => chat(...a),
  fastModel: () => "test-model",
  llmConfigProblem: () => null,
  ensureAiNode: async () => undefined,
}));
const captureCallOutcome = vi.fn(async (_id: string) => undefined);
vi.mock("@/lib/telephony/outcome", () => ({ captureCallOutcome: (id: string) => captureCallOutcome(id) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => void fn(),
}));

import { POST as voice } from "@/app/api/telephony/voice/route";
import { POST as gather } from "@/app/api/telephony/gather/route";
import { placeTwilioCall } from "@/lib/telephony/twilio";
import { CALL_SCRIPTS } from "@/lib/telephony/scripts";

const werkgever = CALL_SCRIPTS["intro-werkgever"]!;
const BYE = "Fijn dat u belde";

function record(overrides: Partial<CallRecord> = {}): CallRecord {
  const rec: CallRecord = {
    id: "c1",
    at: "2026-10-31T10:00:00Z",
    updatedAt: "2026-10-31T10:00:00Z",
    direction: "outbound",
    toNumber: "+31612345678",
    fromNumber: "+3197000000000",
    status: "in-progress",
    script: "intro-werkgever",
    transcript: [{ at: "t", who: "ai", text: "opening" }],
    ...overrides,
  };
  calls.set(rec.id, rec);
  return rec;
}

async function say(speech: string): Promise<string> {
  const req = new Request("http://localhost:3000/api/telephony/gather?callId=c1", {
    method: "POST",
    body: new URLSearchParams({ SpeechResult: speech }).toString(),
  });
  return (await gather(req)).text();
}

beforeEach(() => {
  calls.clear();
  chat.mockResolvedValue({ text: "Antwoord van het taalmodel." });
});
afterEach(() => vi.clearAllMocks());

describe("het begin van een uitgaand gesprek", () => {
  it("zet de opname-melding buiten <Gather>, zodat 'hallo' die niet afkapt", async () => {
    record({ transcript: [] });
    const res = await voice(new Request("http://localhost:3000/api/telephony/voice?callId=c1", { method: "POST", body: "" }));
    const xml = await res.text();
    const gatherAt = xml.indexOf("<Gather");
    expect(gatherAt).toBeGreaterThan(-1);
    expect(xml.indexOf("Dit gesprek kan worden opgenomen")).toBeLessThan(gatherAt);
    expect(xml.indexOf("Ik bel omdat ZekerFlex")).toBeGreaterThan(gatherAt);
    // Het transcript bevat de hele openingstekst.
    expect(calls.get("c1")!.transcript[0]!.text).toContain("opgenomen");
    expect(calls.get("c1")!.transcript[0]!.text).toContain("Ik bel omdat");
  });

  it("vraagt Twilio niet om voicemail-analyse, want die geeft stilte bij het opnemen", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sid: "CA1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await placeTwilioCall({ to: "+31612345678", voiceUrl: "https://x/voice", statusUrl: "https://x/status" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).not.toContain("MachineDetection");
    vi.unstubAllGlobals();
  });
});

describe("de beller zegt alleen hallo", () => {
  it.each(["hallo", "hallo hallo", "Hallo? Hallo?", "Yo."])("%s: geen taalmodel, geen ophangen", async (text) => {
    record();
    const xml = await say(text);
    expect(chat).not.toHaveBeenCalled();
    expect(xml).toContain("Ja, ik hoor u goed.");
    expect(xml).not.toContain(BYE);
    // Bevestiging buiten <Gather>, de reden van het gesprek erbinnen.
    const gatherAt = xml.indexOf("<Gather");
    expect(xml.indexOf("Ja, ik hoor u goed.")).toBeLessThan(gatherAt);
    expect(xml.indexOf("Ik bel omdat ZekerFlex")).toBeGreaterThan(gatherAt);
  });

  it("blijft werken als iemand vaker hallo zegt", async () => {
    record();
    for (let i = 0; i < 4; i++) expect(await say("hallo")).toContain(werkgever.question.slice(0, 20));
    expect(chat).not.toHaveBeenCalled();
  });

  it("stelt inkomend de open vraag in plaats van het belscript", async () => {
    record({ direction: "inbound", script: "inbound" });
    const xml = await say("hallo");
    expect(xml).toContain("zoekt u personeel");
    expect(xml).not.toContain("Ik bel omdat");
  });

  it("stuurt een echte zin wel naar het taalmodel", async () => {
    record();
    const xml = await say("Hallo, ik zoek personeel");
    expect(chat).toHaveBeenCalledOnce();
    expect(xml).toContain("Antwoord van het taalmodel.");
  });
});

describe("'dag' is ook hallo", () => {
  it("hangt niet op bij 'Dag, met Jan' als eerste reactie", async () => {
    record();
    const xml = await say("Dag, met Jan");
    expect(xml).not.toContain(BYE);
    expect(chat).toHaveBeenCalledOnce();
  });

  it("hangt wel op bij 'dag' later in het gesprek", async () => {
    record({ transcript: [{ at: "t", who: "beller", text: "Ik zoek personeel" }] });
    expect(await say("Oké, dag")).toContain(BYE);
  });
});

describe("voicemail en bandjes", () => {
  it("spreekt uitgaand één bericht in en hangt op", async () => {
    record();
    const xml = await say("Dit is de voicemail van 06 12345678 spreek uw bericht in na de toon.");
    expect(xml).toContain("<Hangup/>");
    expect(xml).not.toContain("<Gather");
    expect(chat).not.toHaveBeenCalled();
    expect(calls.get("c1")!.transcript.at(-1)!.text).toMatch(/^\(voicemail\) /);
  });

  it("behandelt dezelfde woorden van een inkomende beller als een gewone zin", async () => {
    record({ direction: "inbound", script: "inbound" });
    const xml = await say("Ik kreeg net jullie voicemail");
    expect(xml).toContain("<Gather");
    expect(chat).toHaveBeenCalledOnce();
  });
});

describe("afronden", () => {
  it("laat uitgaand de uitkomst over aan de status-callback, zodat die niet dubbel loopt", async () => {
    record({ transcript: [{ at: "t", who: "beller", text: "Ik zoek personeel" }] });
    expect(await say("Doei")).toContain(BYE);
    expect(captureCallOutcome).not.toHaveBeenCalled();
  });

  it("legt inkomend de uitkomst zelf vast, want daar komt geen status-callback", async () => {
    record({ direction: "inbound", script: "inbound" });
    await say("Doei");
    expect(captureCallOutcome).toHaveBeenCalledWith("c1");
    expect(calls.get("c1")!.status).toBe("completed");
  });
});

describe("als het taalmodel traag is of faalt", () => {
  it("wacht niet langer dan Twilio toestaat en probeert niet opnieuw", async () => {
    record();
    await say("Ik heb een vraag");
    const opts = chat.mock.calls[0]![0] as { timeoutMs: number; retry: boolean };
    expect(opts.timeoutMs).toBeLessThanOrEqual(8000);
    expect(opts.retry).toBe(false);
  });

  it("geeft een antwoord en houdt het gesprek open", async () => {
    record();
    chat.mockRejectedValue(new Error("timeout"));
    const xml = await say("Ik heb een vraag");
    expect(xml).toContain("zekerflex punt com");
    expect(xml).toContain("<Gather");
  });
});
