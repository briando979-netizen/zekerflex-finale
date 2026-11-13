import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord } from "@/lib/telephony/store";

const calls = new Map<string, CallRecord>();
/** "alles gratis" (lib/ai/gratis.ts): standaard uit, dan vraagt de gesprekslus het taalmodel wel */
const gratis = { aan: false };

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
  findCallByProviderId: vi.fn(async (sid: string) => [...calls.values()].find((c) => c.providerCallId === sid) ?? null),
  createCall: vi.fn(),
}));
const chat = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  chat: (...a: unknown[]) => chat(...a),
  fastModel: () => "test-model",
  llmConfigProblem: () => null,
  ensureAiNode: async () => undefined,
}));
vi.mock("@/lib/ai/gratis", () => ({ getGratisStand: async () => ({ aan: gratis.aan, basis: "", model: "" }) }));
const captureCallOutcome = vi.fn(async (_id: string) => undefined);
vi.mock("@/lib/telephony/outcome", () => ({ captureCallOutcome: (id: string) => captureCallOutcome(id) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => void fn(),
}));

import { POST as voice } from "@/app/api/telephony/voice/route";
import { POST as gather } from "@/app/api/telephony/gather/route";
import { POST as menuRoute } from "@/app/api/telephony/menu/route";
import { POST as status } from "@/app/api/telephony/status/route";
import { placeTwilioCall } from "@/lib/telephony/twilio";
import { CALL_SCRIPTS } from "@/lib/telephony/scripts";
import { sayAndGather } from "@/lib/telephony/twiml";

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
  gratis.aan = false;
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

  it("legt een weigering van Twilio in gewoon Nederlands uit, met wat je eraan doet", async () => {
    const refuse = (body: object, status = 400) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    refuse({ code: 21215, message: "Account not authorized to call +31612345678. Perhaps you need to enable some international permissions" });
    await expect(placeTwilioCall({ to: "+31612345678", voiceUrl: "https://x/voice", statusUrl: "https://x/status" })).rejects.toThrow(
      "Twilio weigerde de oproep (code 21215): Twilio mag dit nummer niet bellen: dat land of soort nummer staat uit. Zet het aan in Twilio onder Voice → Settings → Geo permissions.",
    );
    // onbekende code: Twilio's eigen tekst; geen JSON: de HTTP-status
    refuse({ code: 99999, message: "Something else" });
    await expect(placeTwilioCall({ to: "+31612345678", voiceUrl: "https://x/voice", statusUrl: "https://x/status" })).rejects.toThrow("(code 99999): Something else");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kapot", { status: 502 })));
    await expect(placeTwilioCall({ to: "+31612345678", voiceUrl: "https://x/voice", statusUrl: "https://x/status" })).rejects.toThrow("Twilio weigerde de oproep (502): onbekende fout");
    vi.unstubAllGlobals();
  });
});

describe("luisteren naar de beller", () => {
  const dutch = sayAndGather("Vraag?", "https://x/gather");

  it("gebruikt het spraakmodel met de taalcode die daarbij hoort", () => {
    expect(dutch).toContain('speechModel="deepgram_nova-3"');
    expect(dutch).toContain('language="nl"');
    expect(sayAndGather("Question?", "https://x/gather", { recogLang: "en-US" })).toContain('language="en-US"');
    // "enhanced" hoort bij het oude model en wordt anders genegeerd.
    expect(dutch).not.toContain("enhanced");
  });

  it("gebruikt een positief getal als stilte-drempel, want 'auto' mag niet met een model", () => {
    expect(dutch).toMatch(/speechTimeout="[1-9]\d*"/);
  });

  it("geeft wie even stil is nog één kans voordat er wordt opgehangen", () => {
    expect(dutch.match(/<Gather /g)).toHaveLength(2);
    const stillThere = dutch.indexOf("Bent u er nog?");
    expect(stillThere).toBeGreaterThan(dutch.indexOf("Vraag?"));
    expect(stillThere).toBeLessThan(dutch.lastIndexOf("</Gather>"));
    expect(dutch.indexOf("Ik hoor u niet")).toBeGreaterThan(dutch.lastIndexOf("</Gather>"));
    expect(dutch.endsWith("<Hangup/>")).toBe(true);
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
  const statusCallback = (query: string, form: Record<string, string>) =>
    status(new Request(`http://localhost:3000/api/telephony/status${query}`, { method: "POST", body: new URLSearchParams(form).toString() }));

  it("laat de uitkomst over aan de status-callback, zodat die niet dubbel loopt", async () => {
    record({ transcript: [{ at: "t", who: "beller", text: "Ik zoek personeel" }] });
    expect(await say("Doei")).toContain(BYE);
    expect(calls.get("c1")!.status).toBe("completed");
    expect(captureCallOutcome).not.toHaveBeenCalled();
  });

  it("verwerkt een uitgaand gesprek via het id in de URL", async () => {
    record();
    const res = await statusCallback("?callId=c1", { CallStatus: "completed", CallSid: "CA1" });
    expect(res.status).toBe(204);
    expect(calls.get("c1")!.status).toBe("completed");
    expect(captureCallOutcome).toHaveBeenCalledWith("c1");
  });

  it("sluit een inkomend gesprek af als iemand zomaar ophangt, op basis van de CallSid", async () => {
    record({ direction: "inbound", script: "inbound", providerCallId: "CA-inkomend", status: "in-progress" });
    const res = await statusCallback("", { CallStatus: "completed", CallSid: "CA-inkomend" });
    expect(res.status).toBe(204);
    expect(calls.get("c1")!.status).toBe("completed");
    expect(captureCallOutcome).toHaveBeenCalledWith("c1");
  });

  it("doet niets bij een onbekende CallSid", async () => {
    record({ providerCallId: "CA-ander" });
    const res = await statusCallback("", { CallStatus: "completed", CallSid: "CA-onbekend" });
    expect(res.status).toBe(204);
    expect(captureCallOutcome).not.toHaveBeenCalled();
    expect(calls.get("c1")!.status).toBe("in-progress");
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

  it("met 'alles gratis' vraagt hij het eigen model niet (dat haalt de tijdgrens nooit) en antwoordt meteen (13 nov)", async () => {
    record();
    gratis.aan = true;
    const xml = await say("Ik heb een vraag");
    expect(chat).not.toHaveBeenCalled();
    expect(xml).toContain("zekerflex punt com");
    expect(xml).toContain("<Gather");
  });

  it("de vaste zin wijst de weg naar een mens, en die woorden verbinden echt door (of bieden terugbellen)", async () => {
    record();
    gratis.aan = true;
    expect(await say("Ik heb een vraag")).toContain("zeg dan: een medewerker");
    // niet meer meteen doorschakelen: de wachtrij, of (hier: geen doorschakelnummer) het terugbelverzoek (13 nov)
    expect(await say("een medewerker")).toContain("/api/telephony/terugbellen?callId=c1");
    record({ lang: "en" });
    expect(await say("I have a question")).toContain("just say: a person");
    expect(await say("a person")).toContain("call you back");
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("het keuzemenu: eerst werknemer of bedrijf, dan de keuze (13 nov)", () => {
  async function toets(step: string, digits: string, keer = false): Promise<string> {
    const req = new Request(`http://localhost:3000/api/telephony/menu?callId=c1&step=${step}${keer ? "&keer=2" : ""}`, {
      method: "POST",
      body: new URLSearchParams(digits ? { Digits: digits } : {}).toString(),
    });
    return (await menuRoute(req)).text();
  }

  it("na de taal: wie belt er, met 0 voor een medewerker", async () => {
    record({ direction: "inbound", script: "inbound", transcript: [] });
    const xml = await toets("lang", "1");
    expect(xml).toContain("Bent u werknemer");
    expect(xml).toContain("Toets 0");
    expect(xml).toContain("step=rol");
    expect(xml).toContain('input="dtmf"');
  });

  it("werknemer en dan een keuze: de assistent met de opening van die afdeling", async () => {
    record({ direction: "inbound", script: "inbound", transcript: [] });
    expect(await toets("rol", "1")).toContain("step=werker");
    const xml = await toets("werker", "2");
    expect(xml).toContain("uw account, uren of uitbetaling");
    expect(xml).toContain("/api/telephony/gather?callId=c1");
    expect(calls.get("c1")?.dept).toBe("3");
  });

  it("bedrijf en dan support: de opening voor opdrachtgevers", async () => {
    record({ direction: "inbound", script: "inbound", transcript: [] });
    expect(await toets("rol", "2")).toContain("step=bedrijf");
    expect(await toets("bedrijf", "2")).toContain("support voor opdrachtgevers");
    expect(calls.get("c1")?.dept).toBe("5");
  });

  it("sterretje is terug, 0 is een medewerker (hier zonder nummer: het terugbelverzoek), nooit meteen doorschakelen", async () => {
    record({ direction: "inbound", script: "inbound", transcript: [] });
    expect(await toets("werker", "*")).toContain("Bent u werknemer");
    const xml = await toets("bedrijf", "0");
    expect(xml).toContain("/api/telephony/terugbellen?callId=c1");
    expect(xml).not.toContain("<Dial");
    expect(await toets("rol", "0")).toContain("/api/telephony/terugbellen?callId=c1");
  });

  it("niets of iets onbekends getoetst: het menu nog één keer, daarna de assistent", async () => {
    record({ direction: "inbound", script: "inbound", transcript: [] });
    const eerst = await toets("werker", "7");
    expect(eerst).toContain("Voor werk zoeken");
    expect(eerst).toContain("keer=2");
    expect(await toets("werker", "", true)).toContain("/api/telephony/gather?callId=c1");
  });

  it("het oude menu (gesprekken die tijdens een uitrol al liepen) werkt nog; 9 gaat nu ook naar de wachtrij", async () => {
    record({ direction: "inbound", script: "inbound", transcript: [] });
    expect(await toets("dept", "4")).toContain("Zoekt u zelf werk");
    expect(await toets("dept", "9")).not.toContain("<Dial");
  });
});
