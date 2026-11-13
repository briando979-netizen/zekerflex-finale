import { afterEach, describe, expect, it, vi } from "vitest";

// Een dienst van buiten valt uit (Google Play, Cloudflare, Hetzner, TransIP, Didit): een time-out, netwerkfout of 5xx wordt
// een nette AppError.upstream (503, UPSTREAM_UNAVAILABLE, Nederlands), nooit een kale 500. Een 4xx ("zij zeggen nee") blijft een eigen fout.

const h = vi.hoisted(async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const sleutel = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { sleutel, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});
vi.mock("@/lib/env", async () => ({
  env: {
    TRANSIP_LOGIN: "zekerflex-test",
    TRANSIP_PRIVATE_KEY: (await h).sleutel,
    DIDIT_API_KEY: "didit-sleutel",
    DIDIT_WORKFLOW_ID: "werkstroom",
    DIDIT_BASE_URL: "https://didit.example.test",
    DIDIT_CALLBACK_URL: undefined,
  },
}));
vi.mock("@/lib/logger", async () => ({ logger: (await h).log }));
vi.mock("@/lib/play/account", () => ({ toegangstoken: async () => "play-token" }));

import { AppError } from "@/lib/errors";
import { nieuweEdit, PlayFout } from "@/lib/play/api";
import { alsAppFout } from "@/lib/play/uitleg";
import { applyDnsToCloudflare } from "@/lib/hosting/dns/cloudflare";
import { applyDnsToHetzner } from "@/lib/hosting/dns/hetzner";
import { domainInfo } from "@/lib/mail/hosting/transip";
import { createSession, getDecision } from "@/lib/integrations/didit";
import { fetchOfUitval, isServerFout, nietBereikbaar } from "@/lib/http/uitval";

type Uitval = "time-out" | "netwerk" | "503";
const UITVAL: Uitval[] = ["time-out", "netwerk", "503"];

function stub(uitval: Uitval | { status: number; body?: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith("/auth")) return new Response(JSON.stringify({ token: "transip-token" }), { status: 201 });
      if (uitval === "time-out") throw new DOMException("De bewerking is verlopen", "TimeoutError");
      if (uitval === "netwerk") throw new TypeError("fetch failed");
      if (uitval === "503") return new Response("<html>Bad gateway</html>", { status: 503 });
      return new Response(JSON.stringify(uitval.body ?? {}), { status: uitval.status });
    }),
  );
}

const cfg = { api: { token: "api-token" } } as never;
const ctx = { pakket: "com.voorbeeld.app", serviceEmail: null };

function isNetjes(err: unknown): boolean {
  return err instanceof AppError && err.status === 503 && err.code === "UPSTREAM_UNAVAILABLE" && /niet bereikbaar/i.test(err.message);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("hulpjes", () => {
  it("nietBereikbaar geeft een Nederlandse 503 zonder details", async () => {
    const e = nietBereikbaar("TransIP");
    expect(e.status).toBe(503);
    expect(e.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(e.message).toBe("TransIP is nu niet bereikbaar, probeer het later.");
    expect(isServerFout(500)).toBe(true);
    expect(isServerFout(404)).toBe(false);
  });

  it("fetchOfUitval vertaalt een netwerkfout en laat een antwoord (ook een 5xx) ongemoeid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed https://x.test/?token=geheim"); }));
    const fout = await fetchOfUitval("Cloudflare", "https://x.test/", {}).catch((e: unknown) => e);
    expect(isNetjes(fout)).toBe(true);
    expect((fout as Error).message).not.toContain("geheim");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 502 })));
    expect((await fetchOfUitval("Cloudflare", "https://x.test/", {})).status).toBe(502);
  });
});

describe.each(UITVAL)("uitval: %s", (uitval) => {
  it("Google Play wordt een nette melding", async () => {
    stub(uitval);
    const fout = await nieuweEdit("com.voorbeeld.app").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PlayFout);
    expect(isNetjes(alsAppFout(fout, ctx))).toBe(true);
  });

  it("Cloudflare wordt een nette melding", async () => {
    stub(uitval);
    expect(isNetjes(await applyDnsToCloudflare(cfg, "voorbeeld.test").catch((e: unknown) => e))).toBe(true);
  });

  it("Hetzner DNS wordt een nette melding", async () => {
    stub(uitval);
    expect(isNetjes(await applyDnsToHetzner(cfg, "voorbeeld.test").catch((e: unknown) => e))).toBe(true);
  });

  it("TransIP wordt een nette melding", async () => {
    stub(uitval);
    expect(isNetjes(await domainInfo("voorbeeld.test").catch((e: unknown) => e))).toBe(true);
  });

  it("Didit wordt een nette melding", async () => {
    stub(uitval);
    expect(isNetjes(await createSession({ vendorData: "x" }).catch((e: unknown) => e))).toBe(true);
    expect(isNetjes(await getDecision("sessie-1").catch((e: unknown) => e))).toBe(true);
  });
});

describe("een 4xx ('zij zeggen nee') blijft een eigen fout", () => {
  it("Google Play: 404 is geen uitval", async () => {
    stub({ status: 404, body: { error: { message: "Package not found", status: "NOT_FOUND" } } });
    const fout = await nieuweEdit("com.voorbeeld.app").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PlayFout);
    expect((fout as PlayFout).status).toBe(404);
    const uitleg = alsAppFout(fout, ctx) as AppError;
    expect(uitleg.message).not.toMatch(/niet bereikbaar/i);
  });

  it("Cloudflare en Hetzner: 401 houdt de eigen melding", async () => {
    stub({ status: 401, body: { success: false, errors: [{ message: "Invalid token" }] } });
    const cf = (await applyDnsToCloudflare(cfg, "voorbeeld.test").catch((e: unknown) => e)) as Error;
    expect(cf).not.toBeInstanceOf(AppError);
    expect(cf.message).toContain("Invalid token");
    stub({ status: 401, body: { error: { message: "Unauthorized" } } });
    const hz = (await applyDnsToHetzner(cfg, "voorbeeld.test").catch((e: unknown) => e)) as Error;
    expect(hz).not.toBeInstanceOf(AppError);
    expect(hz.message).toContain("Unauthorized");
  });

  it("TransIP: 404 blijft 'niet gevonden'", async () => {
    stub({ status: 404, body: { error: "geen domein" } });
    const fout = (await domainInfo("voorbeeld.test").catch((e: unknown) => e)) as AppError;
    expect(fout.status).toBe(404);
    expect(fout.code).toBe("NOT_FOUND");
  });

  it("Didit: 400 houdt de eigen melding van de dienst", async () => {
    stub({ status: 400, body: { message: "workflow onbekend" } });
    const fout = (await createSession({ vendorData: "x" }).catch((e: unknown) => e)) as AppError;
    expect(fout.message).toContain("workflow onbekend");
    expect(fout.message).not.toMatch(/niet bereikbaar/i);
  });

  it("Didit: een onleesbaar antwoord op een besluit is een nette melding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("geen json", { status: 200 })));
    const fout = (await getDecision("sessie-1").catch((e: unknown) => e)) as AppError;
    expect(fout).toBeInstanceOf(AppError);
    expect(fout.status).toBe(503);
  });
});
