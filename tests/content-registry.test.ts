import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => undefined) }));

import { CONTENT_REGISTRY, contentKeys, getContentMap, getContentValues, lijstRegels } from "@/lib/content/store";

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

  it("zonder eigen versie geven /prijzen en /over-ons exact de oude teksten (bedragen staan niet in het register)", async () => {
    const pr = await getContentMap(contentKeys("pr."));
    expect(pr["pr.title"]).toBe("Eerlijk en voorspelbaar");
    expect(pr["pr.lead"]).toBe("Geen abonnement. Je betaalt alleen voor daadwerkelijk gewerkte uren; bij meer uren daalt je platformfee volgens een vaste, vooraf zichtbare staffel.");
    expect(pr["pr.cta.primary"]).toBe("Account aanmaken");
    expect(Object.values(pr).some((t) => /€\s?\d/.test(t))).toBe(false);
    const oo = await getContentMap(contentKeys("oo."));
    expect(oo["oo.title"]).toBe("Flexibel werk hoort eerlijk, snel en zeker te zijn.");
    expect(oo["oo.verhaal1"]).toMatch(/^ZekerFlex is ontstaan uit een simpele frustratie: flexibel werken in Nederland is omslachtig geworden\. Zzp'ers wachten/);
    expect(oo["oo.opr.tekst"]).toContain("jóuw agenda");
    expect(contentKeys("pr.").length).toBe(20);
    expect(contentKeys("oo.").length).toBe(17);
  });

  it("homepage-lijsten: één punt per regel, standaard exact de oude lijsten", async () => {
    const v = await getContentValues();
    expect(lijstRegels(v["trust.items"] ?? "")).toEqual(["KVK Handelsregister", "Geverifieerde identiteit (KYC)", "SEPA-uitbetaling", "Wet DBA-monitor"]);
    expect(lijstRegels(v["marquee.items"] ?? "").length).toBe(10);
    expect(lijstRegels(v["emp.points"] ?? "").at(-1)).toBe("Alleen betalen bij gebruik: € 3,50 platformkosten per gewerkt uur");
    expect(v["how.s2.title"]).toBe("Wij zoeken de juiste mensen");
    expect(v["feat.f6.title"]).toBe("Meldingen die kloppen");
    expect(v["comp.c4.body"]).toBe("Elke gevoelige handeling wordt onwisbaar vastgelegd en is terug te zien voor beheerders.");
    // /bedrijven is sinds 14 nov alleen voor bedrijven: geen teksten meer voor werkers in de homepage-sleutels
    expect(CONTENT_REGISTRY.some((c) => c.key.startsWith("fl.") || c.key.startsWith("work."))).toBe(false);
    const home = CONTENT_REGISTRY.filter((c) => (c.group ?? "").startsWith("Homepage")).map((c) => v[c.key] ?? "").join("\n");
    expect(home).not.toMatch(/Ik zoek werk|Zoek je werk|uitbetaald|Gratis voor freelancers|rust-uren/);
    expect(v["hero.ctaPrimary"]).toBe("Klus plaatsen");
    // lege regels en spaties tellen niet
    expect(lijstRegels("  een \n\n twee\n ")).toEqual(["een", "twee"]);
  });
});
