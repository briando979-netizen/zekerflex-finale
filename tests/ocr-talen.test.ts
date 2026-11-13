import { mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { laadOcrVooraf, taalBestandKlaar, zorgVoorTalen } from "@/lib/ocr/talen";

// De OCR-taalbestanden: nooit een half bestand, een mislukte download wordt bij de volgende aanroep opnieuw geprobeerd,
// maximaal één download tegelijk, en vooraf laden gooit nooit. Fetch is gemockt (geen echte download), de map is een
// tijdelijke map.

const GROOT = 600_000;
let dir: string;

const goed = () => new Response(Buffer.alloc(GROOT, 1), { status: 200 });

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zf-ocr-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("zorgVoorTalen", () => {
  it("haalt beide talen op en laat geen tijdelijk bestand achter", async () => {
    const fetchMock = vi.fn(async () => goed());
    vi.stubGlobal("fetch", fetchMock);
    await zorgVoorTalen({ dir });
    expect((await readdir(dir)).sort()).toEqual(["eng.traineddata", "nld.traineddata"]);
    expect((await stat(path.join(dir, "nld.traineddata"))).size).toBe(GROOT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("slaat een bestand dat er al staat (en groot genoeg is) over", async () => {
    await writeFile(path.join(dir, "nld.traineddata"), Buffer.alloc(GROOT, 2));
    const fetchMock = vi.fn(async () => goed());
    vi.stubGlobal("fetch", fetchMock);
    await zorgVoorTalen({ dir });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("vervangt een half bestand (te klein) door een nieuwe download", async () => {
    await writeFile(path.join(dir, "nld.traineddata"), Buffer.alloc(1000));
    expect(await taalBestandKlaar(path.join(dir, "nld.traineddata"))).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => goed()));
    await zorgVoorTalen({ dir });
    expect(await taalBestandKlaar(path.join(dir, "nld.traineddata"))).toBe(true);
  });

  it("een HTTP-fout laat niets achter, en de volgende aanroep probeert het opnieuw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("weg", { status: 503 })));
    await expect(zorgVoorTalen({ dir })).rejects.toThrow(/HTTP 503/);
    expect(await readdir(dir)).toEqual([]);

    const fetchMock = vi.fn(async () => goed());
    vi.stubGlobal("fetch", fetchMock);
    await zorgVoorTalen({ dir });
    expect((await readdir(dir)).sort()).toEqual(["eng.traineddata", "nld.traineddata"]);
  });

  it("een te klein antwoord wordt niet bewaard", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.alloc(100), { status: 200 })));
    await expect(zorgVoorTalen({ dir })).rejects.toThrow(/te klein/);
    expect(await readdir(dir)).toEqual([]);
  });

  it("een afgebroken download (lezen mislukt halverwege) laat geen bestand achter", async () => {
    const kapot = { ok: true, status: 200, arrayBuffer: async () => { throw new Error("verbinding verbroken"); } };
    vi.stubGlobal("fetch", vi.fn(async () => kapot));
    await expect(zorgVoorTalen({ dir })).rejects.toThrow(/verbroken/);
    expect(await readdir(dir)).toEqual([]);
  });

  it("maximaal één download tegelijk: twee gelijktijdige aanroepen delen hem", async () => {
    const fetchMock = vi.fn(async () => goed());
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([zorgVoorTalen({ dir }), zorgVoorTalen({ dir })]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // één keer per taal, niet vier
  });

  it("ruimt een oud tijdelijk bestand op, maar laat een recent met rust", async () => {
    const oud = path.join(dir, "nld.traineddata.111.tmp");
    const nieuw = path.join(dir, "eng.traineddata.222.tmp");
    await writeFile(oud, "x");
    await writeFile(nieuw, "x");
    const lang = new Date("2020-01-01T00:00:00Z");
    await utimes(oud, lang, lang);
    vi.stubGlobal("fetch", vi.fn(async () => goed()));
    await zorgVoorTalen({ dir });
    const namen = await readdir(dir);
    expect(namen).not.toContain("nld.traineddata.111.tmp");
    expect(namen).toContain("eng.traineddata.222.tmp");
  });
});

describe("laadOcrVooraf", () => {
  it("doet niets als alles er al staat", async () => {
    await writeFile(path.join(dir, "nld.traineddata"), Buffer.alloc(GROOT));
    await writeFile(path.join(dir, "eng.traineddata"), Buffer.alloc(GROOT));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await laadOcrVooraf({ dir })).toBe("klaar");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("haalt op wat ontbreekt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => goed()));
    expect(await laadOcrVooraf({ dir })).toBe("opgehaald");
    expect(await taalBestandKlaar(path.join(dir, "eng.traineddata"))).toBe(true);
  });

  it("gooit nooit: een mislukte download geeft 'mislukt'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(laadOcrVooraf({ dir })).resolves.toBe("mislukt");
  });
});
