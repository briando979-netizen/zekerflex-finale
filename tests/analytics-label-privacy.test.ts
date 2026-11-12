import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Wat een klik in de eigen analytics mag meenemen (12 nov 2026, lib/analytics/label-privacy.ts). De voorbeelden zijn de
// vormen uit de droge telling van 31.227 labels (alleen vormen, verzonnen inhoud: .test-adressen, 0-nummers).

const m = vi.hoisted(() => ({ rijen: [] as Record<string, unknown>[] }));
vi.mock("@/lib/prisma", () => ({ prisma: { analyticsEvent: { createMany: async ({ data }: { data: Record<string, unknown>[] }) => void m.rijen.push(...data) } } }));
vi.mock("@/lib/rate-limit", () => ({ fixedWindow: async () => ({ ok: true }) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { bewaarLabel, leesTrackCtx, maakTrackCtx, schoonTrackCtx, veiligLabel } from "@/lib/analytics/label-privacy";
import { trackEvents } from "@/lib/analytics/track";

describe("veiligLabel: het hele label vervangen als er iets persoonlijks in staat", () => {
  it("een bestandsnaam, elke extensie, ook in hoofdletters", () => {
    for (const naam of ["IMG_5686.png", "paspoort-jan-jansen.jpg", "scan.JPEG", "foto.heic", "foto.HEIF", "x.webp", "a.gif", "b.bmp", "c.tif", "d.TIFF", "afschrift.pdf", "brief.doc", "brief.DOCX"]) {
      expect(veiligLabel(naam), naam).toBe("bestand");
    }
  });

  it("e-mailadressen (van afzenders en leads, of info@), ook met emoji of tekst ervoor", () => {
    expect(veiligLabel("info@zekerflex.test")).toBe("e-mailadres");
    expect(veiligLabel("✉️ Jan Jansen <jan.jansen@voorbeeld.test>")).toBe("e-mailadres");
  });

  it("IBAN-vormen in onderwerpregels", () => {
    expect(veiligLabel("Betaling NL00TEST0123456789 ontvangen")).toBe("iban");
    expect(veiligLabel("NL00 TEST 0123 4567 89")).toBe("iban");
  });

  it("telefoonnummers (met + of 0, spaties of streepjes) en elk getal van 9+ cijfers", () => {
    expect(veiligLabel("📤+31600000000 Jan Jansen · 12-11-2026, 14:05")).toBe("nummer");
    expect(veiligLabel("📞 +31 6 0000 0000")).toBe("nummer");
    expect(veiligLabel("06-00000000")).toBe("nummer");
    expect(veiligLabel("BSN 000000000")).toBe("nummer");
  });

  it("gewone knoppen blijven zoals ze zijn", () => {
    for (const l of ["Foto maken", "Opnieuw", "Deze gebruiken", "Opslaan", "Week 45 · 02-11 t/m 08-11", "12 nov 09:00", "Plaats deze klus", "€ 1.250,00"]) {
      expect(veiligLabel(l), l).toBe(l);
    }
    expect(veiligLabel("")).toBeNull();
    expect(veiligLabel(null)).toBeNull();
  });
});

describe("bewaarLabel: op /admin en /studio alleen een code", () => {
  it("vrije knoptekst (namen van leads en klanten) valt weg, een data-track-code blijft", () => {
    expect(bewaarLabel("/admin/beller", "📤+31600000000 Jan Jansen")).toBeNull();
    expect(bewaarLabel("/admin/mail", "Offerte voor Bakkerij De Test")).toBeNull();
    expect(bewaarLabel("/studio/klanten", "Jan Jansen")).toBeNull();
    expect(bewaarLabel("/admin", "lead-bellen")).toBe("lead-bellen");
    expect(bewaarLabel("/studio", "nieuwe-site")).toBe("nieuwe-site");
  });

  it("elders gewoon veiligLabel; een pad dat alleen op admin lijkt telt niet", () => {
    expect(bewaarLabel("/dashboard/verificatie", "IMG_5686.png")).toBe("bestand");
    expect(bewaarLabel("/dashboard/verificatie", "Foto maken")).toBe("Foto maken");
    expect(bewaarLabel("/administratie", "Jaaroverzicht")).toBe("Jaaroverzicht");
  });
});

describe("klikcontext (data-track-ctx)", () => {
  it("alleen vaste sleutels met korte codes; onbekend of ongeldig valt weg", () => {
    expect(leesTrackCtx("stap=selfie;kant=selfie;stand=staand;wijze=knop;reden=geen-gezicht;poging=3")).toEqual({ stap: "selfie", kant: "selfie", stand: "staand", wijze: "knop", reden: "geen-gezicht", poging: "3" });
    expect(leesTrackCtx("stap=selfie;naam=Jan Jansen;reden=Kijk recht")).toEqual({ stap: "selfie" });
    expect(leesTrackCtx("mrz=I<NLD123")).toBeNull();
    expect(leesTrackCtx(`reden=${"a".repeat(31)}`)).toBeNull();
    expect(schoonTrackCtx({ stap: "voor", reden: 5, extra: "x" })).toEqual({ stap: "voor" });
    expect(schoonTrackCtx("stap=voor")).toBeNull();
  });

  it("maakTrackCtx bouwt de attribuutwaarde en laat lege velden weg", () => {
    expect(maakTrackCtx({ stap: "voor", kant: "passport-voor", stand: null, wijze: undefined, poging: 2 })).toBe("stap=voor;kant=passport-voor;poging=2");
    expect(maakTrackCtx({})).toBe("");
  });
});

describe("de server houdt zich aan dezelfde regels (een oude tab stuurt nog oude labels)", () => {
  beforeEach(() => {
    m.rijen.length = 0;
  });

  it("bestandsnaam, nummer en beheerlabel vervangen; meta.ctx geschoond, andere meta blijft", async () => {
    await trackEvents(
      [
        { type: "CLICK" as never, path: "/dashboard/verificatie", label: "IMG_5686.png", meta: { ctx: { stap: "selfie", naam: "Jan", reden: "Kijk recht" } } },
        { type: "CLICK" as never, path: "/admin/beller", label: "📤+31600000000 Jan Jansen" },
        { type: "CLICK" as never, path: "/", label: "📞 +31 6 0000 0000" },
        { type: "CUSTOM" as never, path: "/klus-plaatsen", label: "klus-website", meta: { host: "voorbeeld.test" } },
      ],
      { sessionId: "s1" },
    );
    expect(m.rijen.map((r) => r.label)).toEqual(["bestand", null, "nummer", "klus-website"]);
    expect(m.rijen[0]!.meta).toEqual({ ctx: { stap: "selfie" } });
    expect(m.rijen[3]!.meta).toEqual({ host: "voorbeeld.test" });
  });
});

describe("beacon en ID-scan gebruiken het", () => {
  const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  it("de beacon haalt het label door bewaarLabel en leest data-track-ctx", () => {
    const s = bron("components/analytics/AnalyticsBeacon.tsx");
    expect(s).toContain("bewaarLabel(pad, ruw)");
    expect(s).toContain('closest<HTMLElement>("[data-track-ctx]")');
  });
  it("de ID-scan zet data-track-ctx met maakTrackCtx", () => {
    const s = bron("components/app/IdScan.tsx");
    expect(s).toContain("data-track-ctx={trackCtx || undefined}");
    expect(s).toContain("maakTrackCtx({");
  });
});
