import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// In het geheugen: een KV waar we de storing van kunnen laten falen.
const opslag = new Map<string, unknown>();
let kvFaalt = false;
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (kvFaalt) throw new Error("kv weg");
    return opslag.has(k) ? opslag.get(k) : null;
  },
  kvSet: async (k: string, v: unknown) => {
    if (kvFaalt) throw new Error("kv weg");
    opslag.set(k, v);
  },
}));

import { SESSIE_VANAF_PREFIX, sessieIngetrokken, sessieNogGeldig, trekSessiesIn } from "@/lib/auth/sessie-intrekken";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

beforeEach(() => {
  opslag.clear();
  kvFaalt = false;
});

describe("sessie intrekken na een wachtwoordherstel", () => {
  it("zonder herstel is elke sessie geldig", async () => {
    expect(await sessieNogGeldig("u1", 1_000)).toBe(true);
    expect(await sessieNogGeldig("u1", undefined)).toBe(true);
  });

  it("een sessie van vóór het herstel vervalt, een van erna blijft", async () => {
    const herstel = Date.parse("2026-11-14T22:00:00+01:00");
    await trekSessiesIn("u1", herstel);
    const sec = Math.floor(herstel / 1000);
    expect(await sessieNogGeldig("u1", sec - 3600)).toBe(false); // gestolen of oude sessie
    expect(await sessieNogGeldig("u1", sec - 1)).toBe(false);
    expect(await sessieNogGeldig("u1", sec)).toBe(true); // nieuwe aanmelding in dezelfde seconde
    expect(await sessieNogGeldig("u1", sec + 60)).toBe(true);
  });

  it("het raakt alleen die ene gebruiker", async () => {
    await trekSessiesIn("u1", 10_000_000);
    expect(await sessieNogGeldig("u2", 1)).toBe(true);
    expect(await sessieNogGeldig("u12", 1)).toBe(true);
  });

  it("een token zonder uitgifte-tijd telt na een herstel niet meer", async () => {
    await trekSessiesIn("u1", 5_000_000);
    expect(await sessieNogGeldig("u1", undefined)).toBe(false);
  });

  it("een storing in KV sluit niemand buiten (fail-open)", async () => {
    await trekSessiesIn("u1", 5_000_000);
    kvFaalt = true;
    expect(await sessieNogGeldig("u1", 1)).toBe(true);
  });

  it("de puur-functie: geen moment = nooit ingetrokken; rommel is geen moment", () => {
    expect(sessieIngetrokken(100, null)).toBe(false);
    expect(sessieIngetrokken(100, Number.NaN)).toBe(false);
    expect(sessieIngetrokken(100, 200)).toBe(true);
    expect(sessieIngetrokken(200, 200)).toBe(false);
  });
});

describe("de bedrading", () => {
  const bron = (f: string) => readFileSync(f, "utf8").split("\r\n").join("\n");

  it("getPrincipal en de NextAuth-decode controleren de intrekking", () => {
    expect(bron("lib/auth/index.ts")).toContain("sessieNogGeldig(claims.sub, claims.iat)");
    expect(bron("lib/auth/nextauth.ts")).toContain("sessieNogGeldig(claims.sub, claims.iat)");
  });

  it("het wachtwoordherstel trekt de sessies in, ná het opslaan van het nieuwe wachtwoord", () => {
    const s = bron("lib/auth/password-reset.ts");
    expect(s).toContain("trekSessiesIn(userId)");
    expect(s.indexOf("data: { passwordHash }")).toBeLessThan(s.indexOf("trekSessiesIn(userId)"));
  });

  it("de middleware (Edge, zonder KV) blijft ongemoeid: het controleren staat in Node", () => {
    expect(bron("middleware.ts")).not.toContain("sessie-intrekken");
  });

  it("de sleutel per gebruiker staat in de AVG-lijst (export en wissen)", () => {
    expect(ERASABLE_KV_PREFIXES).toContain(SESSIE_VANAF_PREFIX);
  });
});
