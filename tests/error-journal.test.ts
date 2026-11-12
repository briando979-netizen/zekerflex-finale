import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Foutenlogboek: waarschuwingen en fouten blijven bewaard na een uitrol, per
// soort gegroepeerd, met grenzen tegen een storm, en zonder persoonsgegevens
// of geheimen.

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));

const alertOwnerLater = vi.fn();
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (...a: unknown[]) => alertOwnerLater(...a) }));

const j = await import("@/lib/ops/error-journal");
const { logger, setLogSink } = await import("@/lib/logger");
const { AppError, setUnexpectedErrorReporter, toErrorBody } = await import("@/lib/errors");

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
// distinct words without digits (digits are folded together when grouping)
const word = (i: number) => (i + 1).toString(26).replace(/\d/g, (d) => "qrstuvwxyz"[Number(d)] ?? "q");

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await j.flushJournal();
  store.clear();
  alertOwnerLater.mockClear();
});
afterEach(() => {
  setLogSink(null);
  setUnexpectedErrorReporter(null);
  vi.restoreAllMocks();
});

describe("niets bewaren wat niet bewaard mag worden", () => {
  it("haalt e-mail, IBAN, telefoon, sleutels, BSN en lange id's weg", () => {
    const s = j.scrub(
      "mail jan.devries@example.nl, IBAN NL91ABNA0417164300 of NL91 ABNA 0417 1643 00, bel 06-12345678, 0548 123 456 of +31 6 1234 5678, Bearer abc.def.ghi, sk_live_51HxYzAbCdEf, id 3f9a2b7c1d0e4f5a, token Z8xk2Lq9Vb7Nw3Pr5Ts1Yu6Ac4De8Fg0Hj, bsn 123456782",
    );
    expect(s).not.toMatch(/jan\.devries|NL91|12345678|1643|123 456|1234 5678|abc\.def|sk_live|3f9a2b7c|Z8xk2|123456782/);
    for (const mark of ["<e-mail>", "<iban>", "<telefoon>", "Bearer <weg>", "<sleutel>", "<id>", "<nummer>"]) expect(s).toContain(mark);
  });

  it("laat gewone tekst, datums en factuurnummers staan", () => {
    const text = "Factuur 2026-0042 mislukt op 03-11-2026 om 08:15 (3 pogingen)";
    expect(j.scrub(text)).toBe(text);
  });

  it("haalt de querystring uit een adres, ook als het token procent-gecodeerd is (push-endpoint van Windows)", () => {
    const s = j.scrub('{"endpoint":"https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2fUPZSfvX%2fDrSH0gHUaERGn6AAID3V8mDqNI7%2bcuyGq4fJXK%3d","status":401}');
    expect(s).toBe('{"endpoint":"https://wns2-par02p.notify.windows.com/w/?<weg>","status":401}');
    expect(j.scrub("fetch mislukt voor https://example.com/pagina#stuk")).toBe("fetch mislukt voor https://example.com/pagina?<weg>");
  });

  it("neemt van de context alleen het veilige deel, en houdt de foutcode die de bezoeker zag leesbaar", () => {
    const d = j.detailOf({ route: "GET /x", correlationId: "corr-xyz-123", password: "hunter2", apiKey: "geheim-abc", user: { email: "piet@example.nl", plaats: "Zwolle" }, error: new Error("kapot bij jan@example.nl"), digest: "1234567890" });
    expect(d.startsWith("digest 1234567890 · ")).toBe(true);
    expect(d).not.toMatch(/hunter2|geheim-abc|piet@|jan@|GET \/x|corr-xyz/);
    expect(d).toContain("Error: kapot bij <e-mail>");
    expect(d).toContain("error-journal.test.ts"); // de eerste regels van de stack
    expect(d).toContain("Zwolle");
    expect(j.detailOf({ blob: "x ".repeat(5000) }).length).toBeLessThanOrEqual(800);
  });

  it("routes zonder id's of tokens, zodat dezelfde fout op elke klus één soort is", () => {
    expect(j.normalizeRoute("POST /api/invoices/123/checkout?x=1")).toBe("POST /api/invoices/:n/checkout");
    expect(j.normalizeRoute("GET /review/abcdefghijklmnopqrstuvwxyz012345/naar-google")).toBe("GET /review/:id/naar-google");
    expect(j.normalizeRoute("GET /api/shifts/cm3k2l1m0n9o8p7q6r5s4t3u")).toBe("GET /api/shifts/:id");
    expect(j.normalizeRoute("PATCH /api/admin/websitevoorstellen/72afc2b7d468ec9552f39879")).toBe("PATCH /api/admin/websitevoorstellen/:id");
  });
});

describe("verzamelen en bewaren", () => {
  it("groepeert dezelfde soort melding, ook met andere getallen, maar houdt andere oorzaken apart", async () => {
    j.journal("error", "factuur 12 mislukt", { route: "POST /api/invoices/123/checkout", error: new Error("timeout na 3000 ms") });
    j.journal("error", "factuur 98 mislukt", { route: "POST /api/invoices/456/checkout", error: new Error("timeout na 5000 ms") });
    j.journal("error", "factuur 98 mislukt", { route: "POST /api/invoices/456/checkout", error: new Error("geen verbinding") });
    j.journal("warn", "factuur 98 mislukt", { route: "POST /api/invoices/456/checkout", error: new Error("geen verbinding") });
    await j.flushJournal();
    const groups = await j.listErrorGroups();
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.reason?.startsWith("timeout"))).toMatchObject({ level: "error", count: 2, route: "POST /api/invoices/:n/checkout" });
  });

  it("telt op over meerdere keren wegschrijven en houdt de laatste 3 voorbeelden", async () => {
    const times = [9, 8, 7, 6, 5, 1].map(minutesAgo);
    times.slice(0, 5).forEach((at, i) => j.journal("warn", "langzame pagina", { ms: i + 1 }, at));
    await j.flushJournal();
    j.journal("warn", "langzame pagina", { ms: 6 }, times[5]!);
    await j.flushJournal();
    const [g] = await j.listErrorGroups();
    expect(g).toMatchObject({ count: 6, firstAt: times[0]!.toISOString(), lastAt: times[5]!.toISOString() });
    expect(g!.samples.map((s) => s.detail)).toEqual(['{"ms":4}', '{"ms":5}', '{"ms":6}']);
  });

  it("bij een storm van verschillende meldingen worden de extra's alleen geteld", async () => {
    for (let i = 0; i < 205; i++) j.journal("error", `melding ${word(i)}`);
    await j.flushJournal();
    const groups = await j.listErrorGroups(1000);
    expect(groups).toHaveLength(201);
    expect(groups.find((g) => g.id === "overloop")).toMatchObject({ count: 5, level: "warn" });
  });

  it("ruimt soorten op die 30 dagen niet meer voorkwamen, en houdt er hoogstens 400", async () => {
    const now = Date.now();
    const row = (id: string, ageMs: number) => ({ id, level: "warn", message: id, reason: null, route: null, count: 1, firstAt: new Date(now - ageMs).toISOString(), lastAt: new Date(now - ageMs).toISOString(), samples: [] });
    store.set("fout:aaaaaaaaaaaaaaaa", row("aaaaaaaaaaaaaaaa", 31 * 86_400_000));
    for (let i = 0; i < 405; i++) {
      const id = i.toString(16).padStart(16, "0");
      store.set(`fout:${id}`, row(id, i * 1000));
    }
    expect(await j.pruneJournal(now)).toBe(6);
    expect(store.has("fout:aaaaaaaaaaaaaaaa")).toBe(false);
    expect(store.size).toBe(400);
    expect(store.has(`fout:${"0".repeat(16)}`)).toBe(true);
  });

  it("opgelost haalt een soort weg; onbekende id's doen niets", async () => {
    j.journal("error", "een");
    j.journal("error", "twee");
    await j.flushJournal();
    const [a] = await j.listErrorGroups();
    expect(await j.clearErrorGroups([a!.id, "../../etc/passwd"])).toBe(1);
    expect(await j.listErrorGroups()).toHaveLength(1);
    expect(await j.clearErrorGroups("alles")).toBe(1);
    expect(await j.listErrorGroups()).toHaveLength(0);
  });
});

describe("de eigenaar hoort het als er iets nieuws misgaat", () => {
  it("één melding bij een nieuwe soort fout, niet bij herhaling of waarschuwingen", async () => {
    j.journal("error", "betaling kon niet worden verwerkt", { error: new Error("timeout") });
    j.journal("warn", "langzaam antwoord van KVK");
    await j.flushJournal();
    expect(alertOwnerLater).toHaveBeenCalledTimes(1);
    expect(alertOwnerLater.mock.calls[0]![0]).toMatchObject({ key: "fouten:nieuw", severity: "warning", title: "Nieuwe soort fout op de site", url: "/admin/systeem#fouten" });
    expect(alertOwnerLater.mock.calls[0]![0].detail).toContain("betaling kon niet worden verwerkt · timeout");

    j.journal("error", "betaling kon niet worden verwerkt", { error: new Error("timeout") });
    await j.flushJournal();
    expect(alertOwnerLater).toHaveBeenCalledTimes(1);
  });

  it("meerdere nieuwe soorten tegelijk: één bericht met de eerste drie", async () => {
    for (const w of ["een", "twee", "drie", "vier"]) j.journal("error", `stuk ${w}`);
    await j.flushJournal();
    expect(alertOwnerLater).toHaveBeenCalledTimes(1);
    const a = alertOwnerLater.mock.calls[0]![0];
    expect(a.title).toBe("4 nieuwe soorten fouten op de site");
    expect(a.detail).toContain("… en nog 1");
  });

  it("geen melding voor eigen testmeldingen of een mislukte melding (geen kringloop)", async () => {
    j.journal("error", "client error boundary", { clientMessage: "ZF-TEST foutenlogboek abc" });
    j.journal("error", "owner alert failed", { key: "fouten:nieuw" });
    await j.flushJournal();
    expect(alertOwnerLater).not.toHaveBeenCalled();
    expect(j.worthAlerting({ id: "overloop", level: "error", message: "x", reason: null })).toBe(false);
  });
});

describe("gedeeld tussen de kopieën die de Next.js-build van een module maakt", () => {
  // Live 3 nov: instrumentation.ts zette het aansluitpunt in zijn eigen kopie van
  // lib/logger.ts, de routes gebruikten een andere kopie, en het logboek bleef leeg.
  it("aansluitpunt, foutmelder en wachtrij uit de ene kopie werken ook in de andere", async () => {
    const sink = vi.fn();
    setLogSink(sink);
    const reporter = vi.fn();
    setUnexpectedErrorReporter(reporter);
    vi.resetModules();
    const otherLogger = await import("@/lib/logger");
    const otherErrors = await import("@/lib/errors");
    const otherJournal = await import("@/lib/ops/error-journal");
    expect(otherLogger.logger).not.toBe(logger);
    expect(otherJournal.flushJournal).not.toBe(j.flushJournal);

    otherLogger.logger.warn("via de andere kopie");
    expect(sink).toHaveBeenCalledWith("warn", "via de andere kopie", {});
    otherErrors.toErrorBody(new Error("kale 500 in een route"));
    expect(reporter).toHaveBeenCalledTimes(1);

    j.journal("error", "verzameld in de ene kopie");
    await otherJournal.flushJournal();
    expect((await j.listErrorGroups()).map((g) => g.message)).toContain("verzameld in de ene kopie");
  });
});

describe("waar de meldingen vandaan komen", () => {
  it("de logger geeft waarschuwingen en fouten door, gewone info niet", () => {
    const sink = vi.fn();
    setLogSink(sink);
    logger.info("gewoon");
    logger.warn("let op", { a: 1 });
    logger.error("stuk");
    expect(sink.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["warn", "let op"],
      ["error", "stuk"],
    ]);
  });

  it("een Error in de logregel verliest zijn melding niet meer", () => {
    logger.error("stuk", { error: new Error("de echte reden") });
    expect(String(vi.mocked(console.error).mock.calls.at(-1)?.[0])).toContain("de echte reden");
  });

  it("een kale 500 laat een spoor na, maar niet dubbel en niet voor gewone fouten", () => {
    const seen = vi.fn();
    setUnexpectedErrorReporter(seen);
    expect(toErrorBody(new Error("stuk")).status).toBe(500);
    expect(toErrorBody(AppError.notFound("weg")).status).toBe(404);
    expect(toErrorBody(new Error("al gelogd"), { logged: true }).status).toBe(500);
    expect(seen).toHaveBeenCalledTimes(1);
    setUnexpectedErrorReporter(() => {
      throw new Error("melder kapot");
    });
    expect(toErrorBody(new Error("x")).body.error.code).toBe("INTERNAL");
  });

  it("fouten in pagina's: alleen het routepatroon en de foutcode; doorsturen en 404 tellen niet", async () => {
    setLogSink((level, message, context) => j.journal(level, message, context));
    j.recordRequestError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }), { method: "GET" }, { routePath: "/werkgever", routeType: "render" });
    j.recordRequestError(Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }), { method: "GET" }, { routePath: "/klussen/[id]", routeType: "render" });
    j.recordRequestError(Object.assign(new Error("Cannot read properties of undefined (reading 'naam')"), { digest: "2938475610" }), { method: "GET" }, { routePath: "/review/[token]", routeType: "render" });
    // uitgelogd tijdens het laden (12 nov, /dashboard/profiel): het foutscherm stuurt naar het inloggen, geen storing
    j.recordRequestError(Object.assign(new Error("Je bent niet (meer) ingelogd. Log opnieuw in."), { code: "UNAUTHENTICATED", digest: "2526001685" }), { method: "GET" }, { routePath: "/dashboard/profiel", routeType: "render" });
    await j.flushJournal();
    const groups = await j.listErrorGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ level: "error", message: "unhandled render error", route: "GET /review/[token]", reason: "Cannot read properties of undefined (reading 'naam')" });
    expect(groups[0]!.samples[0]!.detail.startsWith("digest 2938475610")).toBe(true);
  });
});
