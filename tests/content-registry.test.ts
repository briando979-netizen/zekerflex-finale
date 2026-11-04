import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => undefined) }));

import { CONTENT_REGISTRY, contentKeys, getContentMap } from "@/lib/content/store";

describe("tekstregister van de Site-ontwerper", () => {
  it("elke sleutel komt één keer voor en heeft een groep en een standaardtekst", () => {
    const keys = CONTENT_REGISTRY.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of CONTENT_REGISTRY) {
      expect(c.group, c.key).toBeTruthy();
      expect(c.default.trim(), c.key).not.toBe("");
    }
  });

  it("zonder eigen versie geven /voor-bedrijven en /voor-freelancers exact de oude teksten", async () => {
    const vb = await getContentMap(contentKeys("vb."));
    expect(vb["vb.title"]).toBe("Betrouwbare mensen, precies wanneer je ze nodig hebt.");
    expect(vb["vb.lead"]).toBe("Zet een dienst uit en ZekerFlex regelt de rest: de match, de overeenkomst, de check-in, de facturatie en de compliance.");
    expect(vb["vb.cta.secondary"]).toBe("Voor freelancers");
    const vf = await getContentMap(contentKeys("vf."));
    expect(vf["vf.title"]).toBe("Werk dat bij je past. Geld dat op tijd komt.");
    expect(vf["vf.lead"]).toBe("Jij levert vakmanschap. Wij regelen de match, de overeenkomst, de factuur en de uitbetaling — zodat jij je op je werk kunt richten.");
    expect(contentKeys("vb.").length).toBe(16);
    expect(contentKeys("vf.").length).toBe(15);
  });
});
