import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  logError: vi.fn(),
  featureEnabled: vi.fn(),
  imapConfig: vi.fn(),
  recordCronRun: vi.fn(),
  lees: vi.fn(),
  findFirst: vi.fn(),
  gate: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: m.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/flags", () => ({ featureEnabled: m.featureEnabled }));
vi.mock("@/lib/mail", () => ({ imapConfig: m.imapConfig }));
vi.mock("@/lib/metrics", () => ({ recordCronRun: m.recordCronRun }));
vi.mock("@/lib/prisma", () => ({ prisma: { boekAdministratie: { findFirst: m.findFirst } } }));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: m.gate }));
vi.mock("@/lib/env", () => ({ env: { BONNEN_AUTHSERV_ID: " mx.zekerflex.com " } }));
vi.mock("@/lib/boekhouding/bonnen/mail", () => ({ leesPostvakVoorBonnetjes: m.lees }));

const { draaiBonnenMail, MAX_MAILS_PER_RUN } = await import("@/lib/boekhouding/bonnen/mail-taak");
const route = await import("@/app/api/internal/boekhouding/bonnen-mail/route");

const CFG = { host: "imap.test", port: 993, secure: true, user: "u", pass: "p" };

function deps(over: Partial<Parameters<typeof draaiBonnenMail>[0]> = {}) {
  return {
    flagAan: async () => true,
    imapConfig: () => CFG,
    administratieId: async () => "adm1",
    lees: m.lees,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.lees.mockResolvedValue({ bekeken: 2, bonnetjes: 1, bonnen: 1 });
  m.gate.mockReturnValue({ ok: true });
  m.featureEnabled.mockResolvedValue(true);
  m.imapConfig.mockReturnValue(CFG);
  m.findFirst.mockResolvedValue({ id: "adm1" });
});

describe("draaiBonnenMail", () => {
  it("doet niets en leest geen mail zolang de vlag uit staat", async () => {
    const r = await draaiBonnenMail(deps({ flagAan: async () => false }));
    expect(r).toEqual({ status: "uit" });
    expect(m.lees).not.toHaveBeenCalled();
    expect(m.logError).not.toHaveBeenCalled();
  });

  it("leest met een begrensd aantal mails en een eigen IMAP-wachttijd", async () => {
    const r = await draaiBonnenMail(deps({ vertrouwdeServer: "mx.zekerflex.com" }));
    expect(r).toMatchObject({ status: "gelukt", ok: true, uitslag: { bonnen: 1 } });
    const [cfg, id, opties] = m.lees.mock.calls[0]!;
    expect(id).toBe("adm1");
    expect(opties).toEqual({ limiet: MAX_MAILS_PER_RUN, vertrouwdeServer: "mx.zekerflex.com" });
    expect(cfg.timeout).toBeGreaterThan(0);
  });

  it("meldt een ontbrekende mailbox of administratie in het foutenlogboek", async () => {
    expect(await draaiBonnenMail(deps({ imapConfig: () => null }))).toEqual({ status: "niet-ingericht", reden: "geen-mailbox" });
    expect(await draaiBonnenMail(deps({ administratieId: async () => null }))).toEqual({ status: "niet-ingericht", reden: "geen-administratie" });
    expect(m.logError).toHaveBeenCalledTimes(2);
  });

  it("logt een fout van de mailserver zonder adressen of tekst eruit", async () => {
    m.lees.mockRejectedValue(new Error("LOGIN mislukt voor geheim@zekerflex.com"));
    const r = await draaiBonnenMail(deps());
    expect(r).toEqual({ status: "mislukt", ok: false });
    expect(m.logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(m.logError.mock.calls[0])).not.toContain("geheim@");
  });

  it("geeft op bij een trage mailserver (harde tijdsgrens) en meldt dat", async () => {
    m.lees.mockImplementation(() => new Promise(() => undefined));
    const r = await draaiBonnenMail(deps({ tijdsgrensMs: 20 }));
    expect(r).toEqual({ status: "time-out", ok: false });
    expect(m.logError).toHaveBeenCalledWith(expect.stringContaining("time-out"), expect.objectContaining({ reden: "time-out" }));
  });
});

type Handler = (r: Request) => Promise<Response>;
const aanroep = () => (route.POST as Handler)(new Request("http://localhost/api/internal/boekhouding/bonnen-mail", { method: "POST" }));

describe("route /api/internal/boekhouding/bonnen-mail", () => {
  it("weigert zonder interne sleutel", async () => {
    m.gate.mockReturnValue({ ok: false, status: 401, message: "Bad internal token" });
    expect((await aanroep()).status).toBe(401);
    expect(m.lees).not.toHaveBeenCalled();
  });

  it("met de vlag uit: 200, geen mail gelezen, hartslag gelukt", async () => {
    m.featureEnabled.mockResolvedValue(false);
    const res = await aanroep();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "uit" });
    expect(m.recordCronRun).toHaveBeenCalledWith("boekhouding-bonnen-mail", true);
  });

  it("met de vlag aan: leest de Postvak met het authserv-id uit de omgeving", async () => {
    const res = await aanroep();
    expect(res.status).toBe(200);
    expect((await res.json()).uitslag).toEqual({ bekeken: 2, bonnetjes: 1, bonnen: 1 });
    expect(m.lees.mock.calls[0]![2]).toMatchObject({ vertrouwdeServer: "mx.zekerflex.com" });
    expect(m.recordCronRun).toHaveBeenCalledWith("boekhouding-bonnen-mail", true);
  });

  it("een fout geeft 500, een mislukte hartslag en een regel in het foutenlogboek", async () => {
    m.lees.mockRejectedValue(new Error("kapot"));
    const res = await aanroep();
    expect(res.status).toBe(500);
    expect(m.recordCronRun).toHaveBeenCalledWith("boekhouding-bonnen-mail", false);
    expect(m.logError).toHaveBeenCalled();
  });

  it("een vastgelopen database geeft ook 500 en geen stille fout", async () => {
    m.findFirst.mockRejectedValue(new Error("db weg"));
    const res = await aanroep();
    expect(res.status).toBe(500);
    expect(m.recordCronRun).toHaveBeenCalledWith("boekhouding-bonnen-mail", false);
  });
});
