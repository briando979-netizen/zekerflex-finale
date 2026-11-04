import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => undefined) }));

import { BLOK_SOORTEN, PAGINA_SJABLONEN, leegBlok, maakSlug, normalizeBlok, normalizeInhoud, normalizeVertalingen, opVormVanOrigineel, veiligeLink, videoBron } from "@/lib/ontwerp/paginas";
import { videoSoort } from "@/lib/ontwerp/media";

describe("veiligeLink", () => {
  it("laat interne, https-, mail- en telefoonlinks door", () => {
    expect(veiligeLink("/register")).toBe("/register");
    expect(veiligeLink("https://zekerflex.com/prijzen")).toBe("https://zekerflex.com/prijzen");
    expect(veiligeLink("mailto:info@example.com")).toBe("mailto:info@example.com");
    expect(veiligeLink("tel:+31 20 123 4567")).toBe("tel:+31 20 123 4567");
  });
  it("weigert script-, http- en protocol-relatieve links", () => {
    expect(veiligeLink("javascript:alert(1)")).toBe("");
    expect(veiligeLink("JavaScript:alert(1)")).toBe("");
    expect(veiligeLink("data:text/html,<script>")).toBe("");
    expect(veiligeLink("//kwaad.example.com")).toBe("");
    expect(veiligeLink("http://example.com")).toBe("");
  });
});

describe("videoBron", () => {
  it("herkent YouTube-links en ids", () => {
    expect(videoBron("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("yt:dQw4w9WgXcQ");
    expect(videoBron("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("yt:dQw4w9WgXcQ");
    expect(videoBron("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("yt:dQw4w9WgXcQ");
    expect(videoBron("dQw4w9WgXcQ")).toBe("yt:dQw4w9WgXcQ");
  });
  it("laat een eigen media-id staan en weigert de rest", () => {
    expect(videoBron("mabc123def456")).toBe("mabc123def456");
    expect(videoBron("https://vimeo.com/123")).toBe("");
  });
});

describe("maakSlug", () => {
  it("maakt een net adres", () => {
    expect(maakSlug("Personeel voor Festivals & Evenementen!")).toBe("personeel-voor-festivals-evenementen");
    expect(maakSlug("Café België")).toBe("cafe-belgie");
  });
});

describe("blokken", () => {
  it("elk leeg blok is geldig en blijft gelijk na normaliseren", () => {
    for (const { soort } of BLOK_SOORTEN) {
      const b = leegBlok(soort);
      expect(normalizeBlok(b)).toEqual(b);
    }
  });
  it("onbekende soort wordt weggelaten", () => {
    expect(normalizeBlok({ soort: "script", inhoud: "<script>" })).toBeNull();
  });
  it("een gevaarlijke knop wordt leeg, lange tekst ingekort", () => {
    const b = normalizeBlok({ soort: "oproep", kop: "x".repeat(500), knop: { tekst: "Klik", link: "javascript:alert(1)" } });
    expect(b?.soort).toBe("oproep");
    if (b?.soort !== "oproep") return;
    expect(b.kop.length).toBe(160);
    expect(b.knop.link).toBe("");
  });
  it("een galerij neemt alleen echte media-ids, hoogstens 12", () => {
    const b = normalizeBlok({ soort: "galerij", beelden: ["mabc123def456", "../../etc/passwd", ...Array.from({ length: 20 }, (_, i) => `mabc123def4${String(i).padStart(2, "0")}`)] });
    if (b?.soort !== "galerij") throw new Error("geen galerij");
    expect(b.beelden).not.toContain("../../etc/passwd");
    expect(b.beelden.length).toBe(12);
  });
  it("een pagina krijgt een titel en houdt hoogstens 40 blokken", () => {
    const inhoud = normalizeInhoud({ titel: "  ", blokken: Array.from({ length: 50 }, () => ({ soort: "ruimte" })) });
    expect(inhoud.titel).toBe("Nieuwe pagina");
    expect(inhoud.blokken.length).toBe(40);
  });
  it("de sjablonen zijn geldig", () => {
    for (const s of PAGINA_SJABLONEN) {
      const inhoud = s.inhoud();
      expect(normalizeInhoud(inhoud)).toEqual(inhoud);
    }
  });
});

describe("vertalingen", () => {
  it("een vertaling neemt alleen tekst over; links, foto's, volgorde en blokken blijven van het origineel", () => {
    const origineel = normalizeInhoud({
      titel: "Personeel",
      blokken: [
        { id: "baaaa1", soort: "hero", kop: "Kop", tekst: "Tekst", knop: { tekst: "Start", link: "/register" }, beeld: "mabc123def456" },
        { id: "baaaa2", soort: "faq", kop: "Vragen", items: [{ vraag: "V1", antwoord: "A1" }] },
      ],
    });
    const vertaling = normalizeInhoud({
      titel: "Staff",
      blokken: [
        { id: "baaaa1", soort: "hero", kop: "Heading", tekst: "Text", knop: { tekst: "Start now", link: "https://kwaad.example.com" }, beeld: "" },
        { id: "baaaa2", soort: "faq", kop: "Questions", items: [{ vraag: "Q1", antwoord: "A1en" }, { vraag: "extra", antwoord: "extra" }] },
        { id: "baaaa3", soort: "oproep", kop: "Extra blok" },
      ],
    });
    const uit = opVormVanOrigineel(origineel, vertaling);
    expect(uit.titel).toBe("Staff");
    expect(uit.blokken.length).toBe(2);
    const hero = uit.blokken[0];
    if (hero?.soort !== "hero") throw new Error("geen hero");
    expect(hero.kop).toBe("Heading");
    expect(hero.knop).toEqual({ tekst: "Start now", link: "/register" });
    expect(hero.beeld).toBe("mabc123def456");
    const faq = uit.blokken[1];
    if (faq?.soort !== "faq") throw new Error("geen faq");
    expect(faq.items).toEqual([{ vraag: "Q1", antwoord: "A1en" }]);
  });
  it("een blok dat de vertaling mist blijft in de hoofdtaal; alleen geldige talen", () => {
    const origineel = normalizeInhoud({ titel: "X", blokken: [{ id: "bbbbb1", soort: "tekst", kop: "Nederlands", tekst: "Hallo" }] });
    expect(opVormVanOrigineel(origineel, normalizeInhoud({ titel: "", blokken: [] })).blokken[0]).toEqual(origineel.blokken[0]);
    expect(Object.keys(normalizeVertalingen({ en: origineel, xx: origineel, "<script>": origineel }))).toEqual(["en"]);
  });
});

describe("videoSoort", () => {
  it("herkent MP4 en WebM aan de eerste bytes", () => {
    expect(videoSoort(Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]))).toBe("video/mp4");
    expect(videoSoort(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe("video/webm");
  });
  it("een foto of iets anders is geen video", () => {
    expect(videoSoort(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(videoSoort(Buffer.from("<svg>"))).toBeNull();
  });
});
