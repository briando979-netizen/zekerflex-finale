import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /beveiliging toont de aantallen van CrowdSec. Gemeten 13 nov: bijna elk bezoek kwam na meer dan tien minuten
// stilte en wachtte dan 700–900 ms op de hele blokkadelijst (warm 15 ms). Nu krijgt een bezoeker meteen de vorige
// cijfers en ververst het erachter, hooguit één keer tegelijk. Alleen de eerste na een herstart wacht.

vi.mock("@/lib/env", () => ({ env: { CROWDSEC_LAPI_URL: "http://crowdsec:8080", CROWDSEC_BOUNCER_KEY: "sleutel" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { beveiligingsCijfers } from "@/lib/ops/crowdsec";

const g = globalThis as typeof globalThis & { __zfCrowdsec?: Record<string, unknown> };
let blokkades = 0;
let traag = false;
let wachtend: Array<() => void> = [];
const fetchMock = vi.fn(async (_url: string) => {
  if (traag) await new Promise<void>((r) => wachtend.push(r));
  const lijst = Array.from({ length: blokkades }, (_, i) => ({ id: i, origin: "CAPI", type: "ban", scope: "Ip", value: `203.0.113.${i}`, duration: "1h", scenario: "x" }));
  return new Response(JSON.stringify(lijst), { status: 200 });
});
const blokkadeLijsten = () => fetchMock.mock.calls.filter(([u]) => String(u).includes("/v1/decisions")).length;

beforeEach(() => {
  // het geheugen hoort bij de module (globalThis); alleen de inhoud leeg maken
  for (const k of Object.keys(g.__zfCrowdsec ?? {})) delete g.__zfCrowdsec?.[k];
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T12:00:00+01:00"));
  blokkades = 3;
  traag = false;
  wachtend = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("de cijfers op /beveiliging", () => {
  it("koud: wacht één keer op CrowdSec, daarna tien minuten uit het geheugen", async () => {
    expect((await beveiligingsCijfers())?.blokkadesNu).toBe(3);
    blokkades = 5;
    vi.setSystemTime(new Date("2026-11-13T12:09:00+01:00"));
    expect((await beveiligingsCijfers())?.blokkadesNu).toBe(3);
    expect(blokkadeLijsten()).toBe(1);
  });

  it("ouder dan tien minuten: meteen de vorige cijfers, het verversen erachter en hooguit één tegelijk", async () => {
    const eerst = await beveiligingsCijfers();
    vi.setSystemTime(new Date("2026-11-13T12:11:00+01:00"));
    blokkades = 7;
    traag = true; // CrowdSec antwoordt nu niet meteen
    const [a, b] = await Promise.all([beveiligingsCijfers(), beveiligingsCijfers()]);
    expect(a?.blokkadesNu).toBe(3);
    expect(b?.blokkadesNu).toBe(3);
    expect(a?.bijgewerkt).toBe(eerst?.bijgewerkt); // de pagina toont eerlijk van wanneer ze zijn
    expect(blokkadeLijsten()).toBe(2); // één keer koud, één keer verversen (niet twee)

    const bezig = g.__zfCrowdsec?.cijfersBezig as Promise<unknown>;
    for (const r of wachtend) r();
    traag = false;
    await bezig;
    const nieuw = await beveiligingsCijfers();
    expect(nieuw?.blokkadesNu).toBe(7);
    expect(nieuw?.bijgewerkt).toBe(new Date("2026-11-13T12:11:00+01:00").toISOString());
    expect(blokkadeLijsten()).toBe(2);
  });

  it("CrowdSec weg: geen cijfers (null), en de pagina valt niet om", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("kapot", { status: 503 }));
    expect(await beveiligingsCijfers()).toBeNull();
  });
});
