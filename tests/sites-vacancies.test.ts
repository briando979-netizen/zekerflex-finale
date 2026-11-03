import { beforeEach, describe, expect, it, vi } from "vitest";

// Het vacatureblok op de eigen website van een bedrijf haalt bij elk bezoek de
// open diensten van dát bedrijf op ZekerFlex op. Een voorbeeldsite of een
// ontwerpvoorstel heeft geen echte diensten en toont een voorbeeld.

const publicOpenShifts = vi.fn();
vi.mock("@/lib/public-shifts", () => ({ publicOpenShifts: (...a: unknown[]) => publicOpenShifts(...a) }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvDelete: async () => undefined, kvListValues: async () => [] }));

const { siteVacancies, vacancyCount } = await import("@/lib/sites/vacancies");
const { serveSitePath } = await import("@/lib/sites/serve");
const { SECTOR_TEMPLATES, newBlock, pagesFromTemplate } = await import("@/lib/sites/types");

const shift = { id: "shiftA", title: "Bediening", description: null, company: "Bakkerij", city: "Zwolle", postalCode: "8011AB", latitude: 52.5, longitude: 6.1, startsAt: new Date("2026-11-20T15:00:00Z"), endsAt: new Date("2026-11-20T21:00:00Z"), hourlyRateCents: 1600, positions: 2, viaUitzendbureau: false, createdAt: new Date(), skill: null };

function liveSite(over: object = {}) {
  let n = 0;
  const company = { naam: "Bakkerij", kvk: "", straat: "", postcode: "", plaats: "Zwolle", telefoon: "", email: "" };
  const pages = pagesFromTemplate(SECTOR_TEMPLATES[0]!, company, () => `b${n++}`);
  pages[0]!.blocks.push({ ...newBlock("vacatures", "bvac1"), props: { kop: "Werken bij ons", tekst: "", aantal: 4 } } as never);
  return { snapshot: { id: "s1", tenantId: "tenant-echt", slug: "bakkerij", theme: { kleur: "#0E5C4A", accent: "#F2B544", lettertype: "modern", hoeken: "rond" }, bedrijf: company, pages, media: [], createdAt: "", updatedAt: "", ...over }, buildId: "b1", siteId: "s1", domein: null } as never;
}
const opts = { origin: "https://zekerflex.com", noindex: true, root: "/site/bakkerij/" };

beforeEach(() => {
  publicOpenShifts.mockReset();
  publicOpenShifts.mockResolvedValue([shift]);
});

describe("vacatureblok live", () => {
  it("haalt de open diensten van precies dit bedrijf op, met een link naar ZekerFlex", async () => {
    expect(vacancyCount({ blocks: [newBlock("vacatures", "a"), { ...newBlock("vacatures", "b"), props: { kop: "", tekst: "", aantal: 9 } } as never] })).toBe(9);
    const v = await siteVacancies("tenant-echt", 4);
    expect(publicOpenShifts).toHaveBeenCalledWith({ tenantId: "tenant-echt", take: 4 });
    expect(v).toEqual([{ id: "shiftA", titel: "Bediening", start: "2026-11-20T15:00:00.000Z", eind: "2026-11-20T21:00:00.000Z", plaats: "Zwolle", uurloonCents: 1600, url: expect.stringMatching(/\/klussen\/shiftA$/) }]);
    publicOpenShifts.mockRejectedValueOnce(new Error("database weg"));
    expect(await siteVacancies("tenant-echt", 4)).toEqual([]);
  });

  it("de echte website toont ze; een voorstel of voorbeeldsite vraagt niets op", async () => {
    const html = await (await serveSitePath(liveSite(), [], opts)).text();
    expect(html).toContain("Bediening");
    expect(html).toContain("/klussen/shiftA");
    expect(publicOpenShifts).toHaveBeenCalledTimes(1);
    const voorstel = await (await serveSitePath(liveSite({ voorstel: { officieel: null, verloopt: "2099-01-01T00:00:00.000Z" } }), [], opts)).text();
    expect(voorstel).toContain("(voorbeeld)");
    const voorbeeld = await (await serveSitePath(liveSite({ voorbeeld: true }), [], opts)).text();
    expect(voorbeeld).toContain("(voorbeeld)");
    expect(publicOpenShifts).toHaveBeenCalledTimes(1);
    // een pagina zonder vacatureblok vraagt ook niets op
    await serveSitePath(liveSite(), ["over-ons"], opts);
    expect(publicOpenShifts).toHaveBeenCalledTimes(1);
  });
});
