import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => structuredClone(kv.get(k) ?? null)),
  kvSet: vi.fn(async (k: string, v: unknown) => void kv.set(k, structuredClone(v))),
}));
const generateImage = vi.fn();
vi.mock("@/lib/ai/images", () => ({ generateImage: (...a: unknown[]) => generateImage(...a) }));
vi.mock("@/lib/ai/image-prompts", () => ({ STYLE_SUFFIX: "stijl" }));
vi.mock("@/lib/video/bestanden", () => ({
  bewaarBestand: vi.fn(async () => ({ id: "vtest1234567890", naam: "AI-foto", duur: 5 })),
  bestandAdres: (id: string) => `/api/admin/video/bestand/${id}`,
}));
const maakClipNu = vi.fn();
vi.mock("@/lib/video/gratis-taken", () => ({
  maakClipNu: (...a: unknown[]) => maakClipNu(...a),
  pakClipSlot: vi.fn(async () => true),
  geefClipSlot: vi.fn(async () => undefined),
}));
vi.mock("@/lib/video/auto", () => ({ maakAutoVideo: vi.fn() }));
vi.mock("@/lib/video/projecten", () => ({ bewaarProject: vi.fn(), leesProject: vi.fn() }));
const sendUserPush = vi.fn(async () => 1);
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...(a as [])) }));

const { haalUitWachtrij, verwerkWachtrij, wachtrij, zetInWachtrij, WACHT_NA_TEGOED_MS } = await import("@/lib/video/wachtrij");

beforeEach(() => {
  kv.clear();
  generateImage.mockReset();
  maakClipNu.mockReset();
  sendUserPush.mockClear();
});

describe("video-wachtrij op de achtergrond", () => {
  it("werkt een foto af, zet het resultaat erbij en stuurt een push", async () => {
    generateImage.mockResolvedValue({ b64: "aGFsbG8=", width: 1080, height: 1920, backend: "cloudflare", mimeType: "image/png" });
    await zetInWachtrij([{ soort: "foto", omschrijving: "een kok in een keuken", formaat: "9:16", duur: 5 }], "usr_eigenaar");
    const res = await verwerkWachtrij();
    expect(res).toMatchObject({ gedaan: 1, klaar: 1 });
    const [t] = await wachtrij();
    expect(t?.status).toBe("klaar");
    expect(t?.resultaat).toEqual({ soort: "bestand", id: "vtest1234567890", naam: "AI-foto" });
    expect(sendUserPush).toHaveBeenCalledWith(["usr_eigenaar"], expect.objectContaining({ title: "AI-foto is klaar" }));
  });

  it("tegoed op: de clip wacht en wordt later opnieuw geprobeerd; de rest van dezelfde soort slaat de ronde over", async () => {
    maakClipNu.mockRejectedValue(AppError.upstream("Het gratis tegoed van de Hugging Face-videokaarten is voor nu op."));
    generateImage.mockResolvedValue({ b64: "aGFsbG8=", width: 1, height: 1, backend: "cloudflare", mimeType: "image/png" });
    await zetInWachtrij(
      [
        { soort: "clip", omschrijving: "drone over een magazijn", formaat: "9:16", duur: 5 },
        { soort: "clip", omschrijving: "barista maakt latte art", formaat: "9:16", duur: 5 },
        { soort: "foto", omschrijving: "een monteur bij zijn bus", formaat: "9:16", duur: 5 },
      ],
      "usr_eigenaar",
    );
    const voor = Date.now();
    await verwerkWachtrij();
    const lijst = await wachtrij();
    expect(maakClipNu).toHaveBeenCalledTimes(1);
    expect(lijst[0]?.status).toBe("tegoed");
    expect(Date.parse(lijst[0]!.volgendePoging!)).toBeGreaterThanOrEqual(voor + WACHT_NA_TEGOED_MS - 1000);
    expect(lijst[1]?.status).toBe("wacht");
    expect(lijst[2]?.status).toBe("klaar");
    // Geen push voor wachten op tegoed.
    expect(sendUserPush).toHaveBeenCalledTimes(1);
  });

  it("een gewone fout: later opnieuw, na 3 pogingen 'mislukt' met een push", async () => {
    generateImage.mockRejectedValue(new Error("kapot"));
    await zetInWachtrij([{ soort: "foto", omschrijving: "een foto die niet lukt", formaat: "1:1", duur: 5 }], "usr_eigenaar");
    for (let i = 0; i < 3; i++) {
      // Doe alsof de wachttijd voorbij is.
      const l = await wachtrij();
      kv.set("video:wachtrij", l.map((t) => ({ ...t, volgendePoging: undefined })));
      await verwerkWachtrij();
    }
    const [t] = await wachtrij();
    expect(t?.status).toBe("fout");
    expect(t?.pogingen).toBe(3);
    expect(sendUserPush).toHaveBeenCalledWith(["usr_eigenaar"], expect.objectContaining({ title: "AI-foto lukte niet" }));
  });

  it("een lopende opdracht kun je niet weghalen, een wachtende wel", async () => {
    const [a, b] = await zetInWachtrij(
      [
        { soort: "foto", omschrijving: "eerste foto", formaat: "1:1", duur: 5 },
        { soort: "foto", omschrijving: "tweede foto", formaat: "1:1", duur: 5 },
      ],
      "usr_eigenaar",
    );
    kv.set("video:wachtrij", (await wachtrij()).map((t) => (t.id === a!.id ? { ...t, status: "bezig" } : t)));
    expect(await haalUitWachtrij(a!.id)).toBe(false);
    expect(await haalUitWachtrij(b!.id)).toBe(true);
    expect((await wachtrij()).map((t) => t.id)).toEqual([a!.id]);
  });

  it("weigert meer dan 50 open opdrachten", async () => {
    const veel = Array.from({ length: 20 }, (_, i) => ({ soort: "clip" as const, omschrijving: `clip nummer ${i}`, formaat: "9:16" as const, duur: 5 }));
    await zetInWachtrij(veel, "u");
    await zetInWachtrij(veel, "u");
    await expect(zetInWachtrij(veel, "u")).rejects.toThrow(/meer dan 50/);
  });
});
