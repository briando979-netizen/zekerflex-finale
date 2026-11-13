import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STANDAARD_KEUZE } from "@/lib/gratis/keuze-soorten";
import { GRATIS_DIENSTEN } from "@/lib/gratis/diensten";
import {
  beeldenPerDag,
  categorieVoor,
  controleerFoto,
  KOSTEN_PER_BEELD_CENT,
  kledingLink,
  leesStatus,
  MAX_FOTO_TEKENS,
  STANDAARD_PLAFOND_EURO,
  verzoekLichaam,
} from "@/lib/shop/pasdienst-kern";

// 13 nov 2026, eigenaar: "het is de bedoeling dat de foto van de persoon echt letterlijk verandert qua kleren", en
// daarna "ja ja" op een betaalde pasdienst. Voorwaarden (a0): vlag uit tot er een sleutel is, toestemming per keer,
// niets bewaren of loggen, een dagplafond in euro's, eerlijke fouten en altijd de paspop als terugval.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

describe("kosten en plafond", () => {
  it("het plafond in euro's wordt een aantal beelden; standaard laag, nooit onbegrensd", () => {
    expect(STANDAARD_PLAFOND_EURO).toBeLessThanOrEqual(5);
    expect(beeldenPerDag(STANDAARD_PLAFOND_EURO)).toBe(Math.floor((STANDAARD_PLAFOND_EURO * 100) / KOSTEN_PER_BEELD_CENT));
    expect(beeldenPerDag(0)).toBe(0);
    expect(beeldenPerDag(-3)).toBe(0);
    expect(beeldenPerDag(1_000_000)).toBe(beeldenPerDag(100));
    expect(beeldenPerDag(Number.NaN)).toBe(beeldenPerDag(STANDAARD_PLAFOND_EURO));
  });

  it("het dagplafond faalt dicht: geen werkende teller = geen betaald beeld", () => {
    const s = bron("lib/shop/pasdienst.ts");
    expect(s).toMatch(/fixedWindow\(`pasdienst:dag:\$\{amsterdamDayKey\(nu\)\}`, max, 26 \* 3600, \{ failOpen: false \}\)/);
  });
});

describe("de foto", () => {
  it("alleen een data-URI van een JPEG, PNG of WebP, en niet te groot", () => {
    expect(controleerFoto(JPEG)).toEqual({ ok: true, foto: JPEG });
    expect(controleerFoto("")).toEqual({ ok: false, fout: "geen-foto" });
    expect(controleerFoto(42)).toEqual({ ok: false, fout: "geen-foto" });
    expect(controleerFoto("https://voorbeeld.invalid/foto.jpg")).toEqual({ ok: false, fout: "geen-afbeelding" });
    expect(controleerFoto("data:image/svg+xml;base64,PHN2Zz4=")).toEqual({ ok: false, fout: "geen-afbeelding" });
    expect(controleerFoto(`data:image/jpeg;base64,${"A".repeat(MAX_FOTO_TEKENS)}`)).toEqual({ ok: false, fout: "te-groot" });
  });

  it("past binnen de openbare grens van 1 MB per verzoek", () => {
    expect(MAX_FOTO_TEKENS).toBeLessThan(1_000_000 - 2_000);
  });
});

describe("het verzoek aan de pasdienst", () => {
  it("het beeld komt als base64 terug (bij de dienst hooguit een uur), voorzichtig gemodereerd, één beeld", () => {
    const v = verzoekLichaam(JPEG, "https://zekerflex.com/kleding.jpg", "tops");
    expect(v.model_name).toBe("tryon-v1.6");
    expect(v.inputs).toMatchObject({ model_image: JPEG, garment_image: "https://zekerflex.com/kleding.jpg", category: "tops", return_base64: true, num_samples: 1, moderation_level: "conservative" });
  });

  it("de soort kledingstuk wordt een lichaamsdeel; bij twijfel kiest de dienst", () => {
    expect(categorieVoor("Kleding Werkbroek")).toBe("bottoms");
    expect(categorieVoor("Kleding Softshell jas")).toBe("tops");
    expect(categorieVoor("Kleding Jurk")).toBe("one-pieces");
    expect(categorieVoor("Werk & PBM Veiligheidsschoen")).toBe("auto");
  });

  it("alleen een openbare https-foto van het kledingstuk; onze eigen paden worden heel", () => {
    expect(kledingLink("/api/shop/media/abc", "https://zekerflex.com/")).toBe("https://zekerflex.com/api/shop/media/abc");
    expect(kledingLink("https://cdn.voorbeeld.invalid/a.jpg", "https://zekerflex.com")).toBe("https://cdn.voorbeeld.invalid/a.jpg");
    expect(kledingLink("http://onveilig.invalid/a.jpg", "https://zekerflex.com")).toBeNull();
    expect(kledingLink("//elders.invalid/a.jpg", "https://zekerflex.com")).toBeNull();
    expect(kledingLink(null, "https://zekerflex.com")).toBeNull();
  });

  it("het antwoord soepel lezen: alleen een base64-beeld telt, fouten worden een eerlijke reden", () => {
    expect(leesStatus({ status: "completed", output: [JPEG] })).toEqual({ soort: "klaar", beeld: JPEG });
    expect(leesStatus({ status: "completed", output: ["https://cdn.fashn.ai/x.png"] })).toEqual({ soort: "mislukt", reden: "storing" });
    expect(leesStatus({ status: "failed", error: { name: "PoseError", message: "x" } })).toEqual({ soort: "mislukt", reden: "geen-pose" });
    expect(leesStatus({ status: "failed", error: { name: "ContentModerationError" } })).toEqual({ soort: "mislukt", reden: "geweigerd" });
    expect(leesStatus({ status: "processing" })).toEqual({ soort: "bezig" });
    expect(leesStatus(null)).toEqual({ soort: "bezig" });
  });
});

describe("aan, uit en privacy", () => {
  it("staat standaard uit (vlag), en is een eigen keuze bij Alles gratis met de paspop als eigen bron", () => {
    expect(bron("lib/flags/index.ts")).toMatch(/key: "paskamer-echt-passen",[\s\S]{0,900}?default: false,/);
    expect(STANDAARD_KEUZE.pasdienst).toBe("betaald");
    const d = GRATIS_DIENSTEN.find((x) => x.id === "pasdienst");
    expect(d?.hosts).toEqual(["api.fashn.ai"]);
    expect(d?.eigen).toMatch(/paspop/);
  });

  it("zonder uitdrukkelijke toestemming in het verzoek gaat er niets weg; de browser vraagt hem per keer", () => {
    expect(bron("app/api/shop/paskamer/passen/route.ts")).toContain("toestemming: z.literal(true),");
    const ui = bron("components/marketing/paskamer/EchtPassen.tsx");
    expect(ui).toContain("if (!kleding || !akkoord) return;");
    expect(ui).toContain("toestemming: true");
    for (const f of ["lib/i18n/dictionaries.ts", "lib/i18n/dictionary-en.ts"]) expect(bron(f)).toMatch(/echtToestemming: "[^"]*FASHN[^"]*"/);
  });

  it("niets van de foto of het beeld wordt bewaard of gelogd, en de sleutel staat verzegeld", () => {
    const s = bron("lib/shop/pasdienst.ts");
    // de KV krijgt alleen de instellingen (sleutel verzegeld, plafond), nooit de foto of het beeld
    expect(s.match(/kvSet\(/g)?.length).toBe(2);
    expect(s).toContain("nieuw.sleutel = sealSecret(s, DOEL);");
    expect(s).not.toMatch(/logger\.\w+\("[^"]*",\s*\{[^}]*\b(foto|beeld|link|sleutel|kleding|kop)\b/);
    expect(s).not.toMatch(/prisma\./);
    const route = bron("app/api/shop/paskamer/passen/route.ts");
    expect(route).not.toMatch(/logger\.|console\.|kvSet|prisma\.\w+\.(create|update|upsert)/);
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });

  it("het beheer is alleen voor platformbeheer en geeft de sleutel nooit terug", () => {
    const r = bron("app/api/admin/shop/pasdienst/route.ts");
    expect(r.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g)?.length).toBe(3);
    expect(r).not.toMatch(/sleutel: info\.sleutel|openSecret/);
  });
});
