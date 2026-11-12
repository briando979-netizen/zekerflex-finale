import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Een KV in het geheugen: alleen wat de fiscale gegevens gebruiken.
const h = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null)),
  kvSet: vi.fn(async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v))),
  kvListEntries: vi.fn(async (prefix: string) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) }))),
}));

import { bewaarBsnVoorstel, ruimBsnVoorstellenOp, wisBsnVoorstelVan } from "@/lib/fiscal/bsn-voorstel";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";
import { hashBsn } from "@/lib/fiscal/bsn";
import { bsnVoorstelVerlopen } from "@/lib/kyc/bsn-uit-document";
import { retentionRule } from "@/lib/privacy/retention";

// Verzonnen test-BSN's die de elfproef halen; geen echte personen.
const NU = new Date("2026-11-13T12:00:00+01:00");
const dagen = (n: number) => new Date(NU.getTime() - n * 86_400_000);
const VOORSTEL = hashBsn("999999990");
const BEVESTIGD = hashBsn("123456782");

beforeEach(() => h.kv.clear());

describe("BSN-voorstel en de AVG (13 nov)", () => {
  it("bewaart het voorstel met het tijdstip, alleen bij een uitzendkracht", async () => {
    await setFiscal("w1", { workerKind: "uitzendkracht" });
    await setFiscal("z1", { workerKind: "zzp" });
    expect(await bewaarBsnVoorstel("w1", VOORSTEL, NU)).toBe(true);
    expect(await bewaarBsnVoorstel("z1", VOORSTEL, NU)).toBe(false);
    const f = await getFiscal("w1");
    expect(f).toMatchObject({ bsnVoorstelHash: VOORSTEL.hash, bsnVoorstelLast4: "9990", bsnVoorstelAt: NU.toISOString(), bsnHash: null });
    expect((await getFiscal("z1")).bsnVoorstelHash ?? null).toBeNull();
  });

  it("wissen van het account: het voorstel weg, de rest van fiscal blijft", async () => {
    await setFiscal("w1", { workerKind: "uitzendkracht", iban: "NL91ABNA0417164300", bsnVoorstelHash: VOORSTEL.hash, bsnVoorstelLast4: VOORSTEL.last4, bsnVoorstelAt: NU.toISOString() });
    expect(await wisBsnVoorstelVan("w1")).toBe(true);
    const f = await getFiscal("w1");
    expect(f).toMatchObject({ bsnVoorstelHash: null, bsnVoorstelLast4: null, bsnVoorstelAt: null, workerKind: "uitzendkracht", iban: "NL91ABNA0417164300" });
    expect(JSON.stringify(h.kv.get("fiscal:w1"))).not.toContain(VOORSTEL.hash);
    // niets meer te wissen: geen teller
    expect(await wisBsnVoorstelVan("w1")).toBe(false);
    expect(await wisBsnVoorstelVan("bestaat-niet")).toBe(false);
  });

  it("een bevestigd BSN blijft staan bij het wissen (bewaarplicht loonadministratie)", async () => {
    await setFiscal("w1", { workerKind: "uitzendkracht", bsnHash: BEVESTIGD.hash, bsnLast4: BEVESTIGD.last4, bsnVoorstelHash: VOORSTEL.hash, bsnVoorstelLast4: VOORSTEL.last4, bsnVoorstelAt: NU.toISOString() });
    await wisBsnVoorstelVan("w1");
    expect(await getFiscal("w1")).toMatchObject({ bsnHash: BEVESTIGD.hash, bsnLast4: "6782", bsnVoorstelHash: null });
  });

  it("de retentie-sweep: voorstellen ouder dan 30 dagen weg, jongere en bevestigde BSN's blijven", async () => {
    expect(retentionRule("bsn_voorstel")).toMatchObject({ days: 30, onExpiry: "delete", blocksErasure: false });
    const voorstel = (at: Date | null) => ({ workerKind: "uitzendkracht" as const, bsnVoorstelHash: VOORSTEL.hash, bsnVoorstelLast4: VOORSTEL.last4, bsnVoorstelAt: at ? at.toISOString() : null });
    await setFiscal("oud", voorstel(dagen(31)));
    await setFiscal("zonder-tijd", voorstel(null));
    await setFiscal("jong", voorstel(dagen(29)));
    await setFiscal("bevestigd", { workerKind: "uitzendkracht", bsnHash: BEVESTIGD.hash, bsnLast4: BEVESTIGD.last4 });

    // droog: alleen tellen
    expect(await ruimBsnVoorstellenOp(NU, true)).toBe(2);
    expect((await getFiscal("oud")).bsnVoorstelHash).toBe(VOORSTEL.hash);

    expect(await ruimBsnVoorstellenOp(NU, false)).toBe(2);
    expect((await getFiscal("oud")).bsnVoorstelHash).toBeNull();
    expect((await getFiscal("zonder-tijd")).bsnVoorstelLast4).toBeNull();
    expect((await getFiscal("jong")).bsnVoorstelHash).toBe(VOORSTEL.hash);
    expect(await getFiscal("bevestigd")).toMatchObject({ bsnHash: BEVESTIGD.hash, bsnLast4: "6782" });
    // een tweede ronde vindt niets meer
    expect(await ruimBsnVoorstellenOp(NU, false)).toBe(0);
  });

  it("verlopen: geen voorstel is nooit verlopen, een onleesbaar tijdstip wel", () => {
    const grens = dagen(30);
    expect(bsnVoorstelVerlopen({}, grens)).toBe(false);
    expect(bsnVoorstelVerlopen({ bsnVoorstelLast4: "9990", bsnVoorstelAt: "geen datum" }, grens)).toBe(true);
    expect(bsnVoorstelVerlopen({ bsnVoorstelLast4: "9990", bsnVoorstelAt: dagen(1).toISOString() }, grens)).toBe(false);
  });

  it("het wissen en de sweep roepen het op, met de teller cleared.bsn_voorstel", () => {
    const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    expect(bron("lib/privacy/anonymize.ts")).toMatch(/wisBsnVoorstelVan\(userId\)[\s\S]{0,80}cleared\.bsn_voorstel = 1/);
    expect(bron("lib/privacy/sweep.ts")).toMatch(/cleared\.bsn_voorstel = await ruimBsnVoorstellenOp\(now, dryRun\)/);
  });
});
