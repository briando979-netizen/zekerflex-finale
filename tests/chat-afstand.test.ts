import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { afstandMeter, afstandTekst, gebiedVoorTwee, MAX_ZOOM, zoomVoorTwee } from "@/lib/kaart/afstand";

// Hoe ver een gedeelde locatie van jou is, zoals in WhatsApp (15 nov 2026, eigenaar: "precies zien hoever de beide personen
// zijn"): de afstand, en een kaartje met beide plekken en een stippellijn ertussen.

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");

const DAM = { lat: 52.373, lng: 4.8926 };
const CENTRAAL = { lat: 52.3791, lng: 4.9003 };
const ZUIDBROEK = { lat: 53.1636, lng: 6.8617 };
const MAASTRICHT = { lat: 50.8514, lng: 5.691 };

describe("de afstand", () => {
  it("rekent in rechte lijn (haversine)", () => {
    expect(afstandMeter({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
    const dam = afstandMeter(DAM, CENTRAAL);
    expect(dam).toBeGreaterThan(800);
    expect(dam).toBeLessThan(900);
    expect(afstandMeter(DAM, DAM)).toBe(0);
    expect(afstandMeter(DAM, CENTRAAL)).toBeCloseTo(afstandMeter(CENTRAAL, DAM), 6);
  });

  it("schrijft hem zoals je hem zegt, in de taal van de chat", () => {
    expect(afstandTekst(12, "nl-NL")).toBe("10 m");
    expect(afstandTekst(347, "nl-NL")).toBe("350 m");
    expect(afstandTekst(1234, "nl-NL")).toBe("1,2 km");
    expect(afstandTekst(1234, "en-GB")).toBe("1.2 km");
    expect(afstandTekst(2000, "nl-NL")).toBe("2 km");
    expect(afstandTekst(12_345, "nl-NL")).toBe("12 km");
  });
});

describe("het kaartje met beide plekken", () => {
  it("zoomt zo ver in als kan terwijl beide passen, en geeft op tegen grote afstanden", () => {
    expect(zoomVoorTwee(DAM, DAM, 260, 160)).toBe(MAX_ZOOM);
    const z = zoomVoorTwee(DAM, CENTRAAL, 260, 160);
    expect(z).not.toBeNull();
    expect(z as number).toBeLessThan(MAX_ZOOM);
    expect(zoomVoorTwee(ZUIDBROEK, MAASTRICHT, 260, 160)).toBeNull();
  });

  it("zet beide plekken binnen het kaartje, het midden ertussen in het midden, met tegels eronder", () => {
    const g = gebiedVoorTwee(DAM, CENTRAAL, 260, 160);
    expect(g).not.toBeNull();
    if (!g) return;
    for (const p of [g.a, g.b]) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(130 - 28 + 1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(80 - 28 + 1);
    }
    expect(g.a.x + g.b.x).toBeLessThanOrEqual(1);
    expect(g.a.y + g.b.y).toBeLessThanOrEqual(1);
    // de tegels dekken het hele kaartje
    expect(Math.min(...g.tegels.map((t) => t.links))).toBeLessThanOrEqual(-130);
    expect(Math.max(...g.tegels.map((t) => t.links + 256))).toBeGreaterThanOrEqual(130);
    expect(Math.min(...g.tegels.map((t) => t.boven))).toBeLessThanOrEqual(-80);
    expect(Math.max(...g.tegels.map((t) => t.boven + 256))).toBeGreaterThanOrEqual(80);
  });
});

describe("in de chat", () => {
  it("onder een locatie van een ander, buiten de link (het kan een knop zijn); niet onder je eigen", () => {
    const bubbel = lees("components/chat/MessageBubble.tsx");
    expect(bubbel).toMatch(/<\/a>\n\s+\{\/\* hoe ver is dit van jou[^\n]*\*\/\}\n\s+\{!mine && <AfstandRegel plek=\{m\.location\} \/>\}/);
    expect(bubbel).toContain("<LocatieKaartje plek={m.location} mine={mine} />");
    const live = lees("components/chat/LiveLocatieKaart.tsx");
    expect(live).toMatch(/<\/a>\n\s+\{\/\*[^\n]*\*\/\}\n\s+\{!mine && <AfstandRegel plek=\{plek\} \/>\}/);
  });

  it("je eigen plek: je lopende live-deling in het gesprek, anders je toestel met toestemming; hij gaat nergens heen", () => {
    const ctx = lees("components/chat/AfstandContext.tsx");
    expect(ctx).toContain('query({ name: "geolocation" as PermissionName })');
    expect(ctx).toContain('if (s.state === "granted") {');
    expect(ctx).toContain("if (!nodig || live) return;");
    // alleen meten, nooit versturen
    expect(ctx).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest/);
    const lijst = lees("components/chat/InboxPage.tsx");
    expect(lijst).toContain("<AfstandProvider mijnLive={mijnLivePlek(messages, me?.userId)}");
    expect(lijst).toContain('b.kind === "location" && b.location?.live && isLiveActief(b.location.live)');
  });

  it("de teksten staan in alle vijf de talen van de chat", () => {
    const bron = lees("lib/chat/teksten-bubble.ts");
    const talen = lees("lib/chat/teksten-bubble-talen.ts");
    for (const k of ["afstandVanJou", "afstandSamen", "afstandVraag", "afstandZoeken", "afstandUit", "afstandPrive", "afstandJij"]) {
      expect(bron.match(new RegExp(`\\n\\s+${k}: "`, "g")), k).toHaveLength(1);
      expect(talen.match(new RegExp(`\\n\\s+${k}: "`, "g")), k).toHaveLength(4);
    }
  });
});
