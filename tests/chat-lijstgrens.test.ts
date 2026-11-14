import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { begrensLijst, MAX_BERICHTEN, MAX_BYTES } from "@/lib/messaging/lijstgrens";

// De grens van een gesprekslijst in KV (14 nov 2026): hooguit 5.000 berichten én 4 MB JSON; de oudste vallen weg, het nieuwste
// blijft altijd. Puur, met grote nepberichten (geen echte tekst).

const bericht = (i: number, tekens: number) => ({ id: `m${i}`, threadId: "t1", from: "u1", at: "2026-11-14T08:00:00.000Z", text: "x".repeat(tekens), kind: "text" });
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), "utf8");

describe("begrensLijst", () => {
  it("de grenzen: 5.000 berichten en 4 MB", () => {
    expect(MAX_BERICHTEN).toBe(5000);
    expect(MAX_BYTES).toBe(4 * 1024 * 1024);
  });

  it("een gewone lijst blijft zoals hij is", () => {
    const lijst = Array.from({ length: 63 }, (_, i) => bericht(i, 80));
    const s = begrensLijst(lijst);
    expect(s.lijst).toBe(lijst);
    expect(s).toMatchObject({ verwijderd: 0, opBytes: false, bytes: bytes(lijst) });
  });

  it("boven het aantal vallen de oudste weg (zoals vroeger slice(-5000)), zonder bytemelding", () => {
    const lijst = Array.from({ length: 5003 }, (_, i) => bericht(i, 10));
    const s = begrensLijst(lijst);
    expect(s.lijst).toHaveLength(5000);
    expect(s.lijst[0]!.id).toBe("m3");
    expect(s.lijst[4999]!.id).toBe("m5002");
    expect(s).toMatchObject({ verwijderd: 3, opBytes: false });
  });

  it("5.000 berichten van 10.000 tekens (±51 MB) worden op 4 MB afgesneden, de nieuwste blijven", () => {
    const lijst = Array.from({ length: 5000 }, (_, i) => bericht(i, 10_000));
    const s = begrensLijst(lijst);
    expect(s.opBytes).toBe(true);
    expect(s.bytes).toBeLessThanOrEqual(MAX_BYTES);
    expect(s.bytes).toBe(bytes(s.lijst));
    // ±10,1 kB per bericht: er passen er ruim 400, en geen enkele meer
    expect(s.lijst.length).toBeGreaterThan(400);
    expect(s.lijst.length).toBeLessThan(420);
    expect(bytes([lijst[5000 - s.lijst.length - 1], ...s.lijst])).toBeGreaterThan(MAX_BYTES);
    expect(s.lijst[s.lijst.length - 1]!.id).toBe("m4999");
    expect(s.verwijderd).toBe(5000 - s.lijst.length);
  });

  it("eigen grenzen voor een test: op bytes snijden telt exact, inclusief komma's en haken", () => {
    const lijst = Array.from({ length: 10 }, (_, i) => bericht(i, 100));
    const een = bytes(lijst[0]);
    // precies ruimte voor drie berichten: 2 haken + 3 berichten + 2 komma's
    const s = begrensLijst(lijst, { bytes: 2 + 3 * een + 2 });
    expect(s.lijst.map((m) => m.id)).toEqual(["m7", "m8", "m9"]);
    expect(s).toMatchObject({ verwijderd: 7, opBytes: true, bytes: 2 + 3 * een + 2 });
    // één byte minder en het vierde-van-achteren past niet meer, maar ook het derde niet: twee over
    expect(begrensLijst(lijst, { bytes: 2 + 3 * een + 1 }).lijst).toHaveLength(2);
  });

  it("het nieuwste bericht blijft altijd staan, ook als dat alleen al boven de grens zit", () => {
    const lijst = [bericht(0, 50), bericht(1, 50), bericht(2, 5000)];
    const s = begrensLijst(lijst, { bytes: 1000 });
    expect(s.lijst.map((m) => m.id)).toEqual(["m2"]);
    expect(s.verwijderd).toBe(2);
    expect(s.opBytes).toBe(true);
    expect(begrensLijst([], { bytes: 10 })).toMatchObject({ lijst: [], verwijderd: 0, opBytes: false });
  });

  it("de store gebruikt overal bewaarLijst: geen losse slice(-5000) of kvAppend meer, en de logregel kent geen inhoud", () => {
    const bron = readFileSync("lib/messaging/store.ts", "utf8");
    expect(bron).not.toContain("slice(-5000)");
    expect(bron).not.toContain("kvAppend");
    expect(bron.match(/bewaarLijst\(/g)?.length).toBeGreaterThanOrEqual(10);
    expect(bron).toContain('logger.warn("chat: gesprekslijst op de bytegrens gesneden", { verwijderd: s.verwijderd, over: s.lijst.length, bytes: s.bytes })');
  });
});
