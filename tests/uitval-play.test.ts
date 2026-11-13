import { afterEach, describe, expect, it, vi } from "vitest";

// Google Play bij uitval, los van de andere diensten. Dezelfde opzet als tests/play-api.test.ts: de mock van
// "@/lib/play/account" staat bovenaan, vóór de imports, en levert alleen toegangstoken (het enige wat api.ts gebruikt).
vi.mock("@/lib/play/account", () => ({ toegangstoken: async () => "proef-token" }));

import { nieuweEdit, PlayFout } from "@/lib/play/api";
import { alsAppFout } from "@/lib/play/uitleg";
import { AppError } from "@/lib/errors";

const ctx = { pakket: "com.voorbeeld.app", serviceEmail: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

function isNetjes(err: unknown): boolean {
  return err instanceof AppError && err.status === 503 && err.code === "UPSTREAM_UNAVAILABLE" && /niet bereikbaar/i.test(err.message);
}

describe("Google Play valt uit", () => {
  it("een time-out wordt een nette melding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("De bewerking is verlopen", "TimeoutError"); }));
    const fout = await nieuweEdit("com.voorbeeld.app").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PlayFout);
    expect(isNetjes(alsAppFout(fout, ctx))).toBe(true);
  });

  it("een netwerkfout wordt een nette melding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const fout = await nieuweEdit("com.voorbeeld.app").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PlayFout);
    expect(isNetjes(alsAppFout(fout, ctx))).toBe(true);
  });

  it("een 503 (HTML-foutpagina) wordt een nette melding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 503 })));
    const fout = await nieuweEdit("com.voorbeeld.app").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PlayFout);
    expect((fout as PlayFout).status).toBe(503);
    expect(isNetjes(alsAppFout(fout, ctx))).toBe(true);
  });

  it("een 404 ('zij zeggen nee') blijft een eigen fout en is geen uitval", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Package not found", status: "NOT_FOUND" } }), { status: 404 })));
    const fout = await nieuweEdit("com.voorbeeld.app").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PlayFout);
    expect((fout as PlayFout).status).toBe(404);
    const uitleg = alsAppFout(fout, ctx) as AppError;
    expect(uitleg.message).not.toMatch(/niet bereikbaar/i);
  });

  it("een succesvol antwoord dat geen JSON is, geeft een eigen fout in plaats van een kale 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("geen json", { status: 200 })));
    const fout = await nieuweEdit("com.voorbeeld.app").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PlayFout);
    expect((fout as PlayFout).status).toBe(502);
  });
});
