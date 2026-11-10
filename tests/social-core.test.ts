import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/client", () => ({ chatJson: vi.fn(), llmConfigProblem: () => "geen model" }));

import {
  KANALEN,
  deelLink,
  kanaalVanReferrer,
  kortIn,
  schoneHashtags,
  tekstVoorKanaal,
} from "@/lib/social/kanalen";
import { SLOT_UREN, isAanDeBeurt, komendeWerkdagen, postStatus, type SocialPost } from "@/lib/social/model";
import { metaFoutTekst } from "@/lib/social/meta";
import { SJABLONEN, leesPosts, schrijfPosts } from "@/lib/social/schrijf";

const basis = (extra: Partial<SocialPost> = {}): SocialPost => ({
  id: "p1",
  tekst: "Een test",
  hashtags: [],
  kanalen: ["facebook", "linkedin"],
  beeldUrl: null,
  beeldIdee: "",
  link: "",
  plan: "2026-11-12T11:00:00.000Z",
  goedgekeurd: true,
  bron: "handmatig",
  doelgroep: "algemeen",
  campagne: null,
  uitslag: {},
  gemaakt: "2026-11-10T10:00:00.000Z",
  gemaaktDoor: null,
  ...extra,
});

describe("kanalen", () => {
  it("alleen Facebook en Instagram plaatsen zelf; de rest is handmatig (eerlijk over wat kan)", () => {
    expect(KANALEN.filter((k) => k.wijze === "api").map((k) => k.id).sort()).toEqual(["facebook", "instagram"]);
  });

  it("hashtags: één #, geen leestekens, geen dubbelen, binnen het maximum", () => {
    expect(schoneHashtags(["#flexwerk", "flex werk!", "FLEXWERK", "", "##zzp"], 3)).toEqual(["#flexwerk", "#zzp"]);
  });

  it("kortIn knipt op een zin of woord, nooit midden in een woord", () => {
    const t = "Eerste zin is lang genoeg. Tweede zin loopt door en door tot hij te lang wordt voor de limiet.";
    const k = kortIn(t, 40);
    expect(k.length).toBeLessThanOrEqual(40);
    expect(k.endsWith(".") || k.endsWith("…")).toBe(true);
    expect(kortIn("kort", 40)).toBe("kort");
  });

  it("X blijft binnen 280 tekens, ook met hashtags", () => {
    const lang = "Werk dat past bij jou. ".repeat(30);
    const t = tekstVoorKanaal("x", lang, ["flexwerk", "zzp", "horeca"]);
    expect(t.length).toBeLessThanOrEqual(280);
    expect(t.split("#").length - 1).toBeLessThanOrEqual(2);
  });

  it("WhatsApp en Google krijgen geen hashtags", () => {
    expect(tekstVoorKanaal("whatsapp", "Tekst hier voor jou.", ["a", "b"])).not.toContain("#");
    expect(tekstVoorKanaal("google", "Tekst hier voor jou.", ["a", "b"])).not.toContain("#");
  });

  it("deelLink bestaat alleen voor kanalen met een echte deelknop", () => {
    expect(deelLink("linkedin", "t", "https://zekerflex.com")).toContain("linkedin.com/sharing");
    expect(deelLink("x", "hallo wereld", "https://zekerflex.com")).toContain("hallo%20wereld");
    expect(deelLink("instagram", "t", "https://zekerflex.com")).toBeNull();
    expect(deelLink("tiktok", "t", "https://zekerflex.com")).toBeNull();
  });

  it("herkent het kanaal aan de herkomst van een bezoek", () => {
    expect(kanaalVanReferrer("l.instagram.com")).toBe("instagram");
    expect(kanaalVanReferrer("www.linkedin.com")).toBe("linkedin");
    expect(kanaalVanReferrer("t.co")).toBe("x");
    expect(kanaalVanReferrer("google.com")).toBeNull();
  });
});

describe("status en planning", () => {
  it("een bericht zonder goedkeuring blijft concept en is nooit aan de beurt", () => {
    const p = basis({ goedgekeurd: false });
    expect(postStatus(p)).toBe("concept");
    expect(isAanDeBeurt(p, new Date("2026-12-01T00:00:00Z"))).toBe(false);
  });

  it("goedgekeurd met een tijd = gepland; pas aan de beurt als die tijd er is", () => {
    const p = basis();
    expect(postStatus(p)).toBe("gepland");
    expect(isAanDeBeurt(p, new Date("2026-11-12T10:59:00Z"))).toBe(false);
    expect(isAanDeBeurt(p, new Date("2026-11-12T11:00:00Z"))).toBe(true);
  });

  it("status volgt de kanalen: alles geplaatst, deels, jij plaatst, mislukt", () => {
    const at = "2026-11-12T11:01:00.000Z";
    expect(postStatus(basis({ uitslag: { facebook: { status: "gepost", at }, linkedin: { status: "gepost", at } } }))).toBe("gepost");
    expect(postStatus(basis({ uitslag: { facebook: { status: "gepost", at }, linkedin: { status: "handmatig", at } } }))).toBe("deels");
    expect(postStatus(basis({ uitslag: { facebook: { status: "handmatig", at }, linkedin: { status: "handmatig", at } } }))).toBe("handmatig");
    expect(postStatus(basis({ uitslag: { facebook: { status: "mislukt", at, fout: "x" }, linkedin: { status: "handmatig", at } } }))).toBe("mislukt");
  });

  it("een verwerkt bericht is niet nog eens aan de beurt", () => {
    const at = "2026-11-12T11:01:00.000Z";
    const p = basis({ uitslag: { facebook: { status: "gepost", at }, linkedin: { status: "handmatig", at } } });
    expect(isAanDeBeurt(p, new Date("2026-11-13T00:00:00Z"))).toBe(false);
  });

  it("werkdagen: ma-vr, vanaf de dag erna, ook over een weekend en een jaarwisseling", () => {
    // donderdag 31 dec 2026: vrijdag 1 jan, dan het weekend over naar maandag 4 en dinsdag 5 jan
    const d = komendeWerkdagen({ year: 2026, month: 12, day: 31 }, 3);
    expect(d).toEqual([
      { year: 2027, month: 1, day: 1 },
      { year: 2027, month: 1, day: 4 },
      { year: 2027, month: 1, day: 5 },
    ]);
    expect(SLOT_UREN.length).toBe(3);
  });
});

describe("Meta-fouten", () => {
  it("geeft gewone zinnen, zonder tokens of adressen", () => {
    expect(metaFoutTekst(190, "Error validating access token")).toContain("verlopen");
    expect(metaFoutTekst(200, "x")).toContain("recht");
    const tekst = metaFoutTekst(1, `Kon https://graph.facebook.com/x?token=${"a".repeat(60)} niet lezen`);
    expect(tekst).not.toContain("http");
    expect(tekst).not.toContain("a".repeat(40));
  });
});

describe("berichten schrijven", () => {
  it("leest het antwoord van het model soepel: één onbruikbaar bericht wordt overgeslagen", () => {
    const posts = leesPosts({
      posts: [
        { tekst: "Een prima bericht over flexwerk bij ZekerFlex, gewoon Nederlands.", hashtags: ["flexwerk", 7], beeldIdee: { x: 1 } },
        { tekst: "kort" },
        null,
        { tekst: { raar: "object dat geen tekst is maar toch genoeg tekens heeft om door te gaan" } },
      ],
    });
    expect(posts.length).toBe(2);
    expect(posts[0]?.hashtags).toEqual(["flexwerk", "7"]);
  });

  it("zonder model komen er vaste, gecontroleerde teksten (nooit een verzonnen aantal)", async () => {
    const r = await schrijfPosts({ doelgroep: "werkgever", aantal: 4 });
    expect(r.bron).toBe("sjabloon");
    expect(r.posts.length).toBe(4);
    for (const p of r.posts) expect(p.tekst).not.toMatch(/bank|betaalpas|voorschot|spaar/i);
  });

  it("vaste teksten beloven niets over de gestopte bank", () => {
    for (const s of SJABLONEN) expect(s.tekst).not.toMatch(/eigen rekening|betaalpas|potje|sparen|bonus/i);
  });
});
