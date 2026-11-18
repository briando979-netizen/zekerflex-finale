import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VOORSTELLEN, cookiebeleidLink, voorstelPad } from "@/lib/voorstel/subdomein";

// De cookiemelding op een voorstel-subdomein (18 nov 2026): "Lees het volledige cookiebeleid" ging naar /cookiebeleid,
// en dat pad bestaat daar niet (404). De link wijst daar naar de hoofdsite; elders blijft hij relatief. De middleware laat
// nog steeds niets extra's door.

describe("cookiebeleid-link op een voorstel-subdomein", () => {
  it("wijst op een voorstel-host naar de hoofdsite en elders naar de gewone pagina", () => {
    for (const naam of Object.keys(VOORSTELLEN)) expect(cookiebeleidLink(`${naam}.zekerflex.com`)).toBe("https://zekerflex.com/cookiebeleid");
    expect(cookiebeleidLink("SmileyApp.zekerflex.com")).toBe("https://zekerflex.com/cookiebeleid");
    expect(cookiebeleidLink("zekerflex.com")).toBe("/cookiebeleid");
    expect(cookiebeleidLink("www.zekerflex.com")).toBe("/cookiebeleid");
    expect(cookiebeleidLink("localhost")).toBe("/cookiebeleid");
    expect(cookiebeleidLink("onbekend.zekerflex.com")).toBe("/cookiebeleid");
    expect(cookiebeleidLink("smileyapp.zekerflex.com.evil.example")).toBe("/cookiebeleid");
    expect(cookiebeleidLink(null)).toBe("/cookiebeleid");
  });

  it("het subdomein zelf laat /cookiebeleid nog steeds niet door (niets extra's open)", () => {
    expect(voorstelPad("smileyapp", "/cookiebeleid")).toBe("/voorstel/smileyapp/cookiebeleid");
    expect(voorstelPad("smileyapp", "/login")).toBe("/voorstel/smileyapp/login");
    expect(voorstelPad("smileyapp", "/api/auth/signin")).toBeNull();
  });

  it("de cookiemelding gebruikt het hulpje na het laden", () => {
    const bron = readFileSync(path.join(process.cwd(), "components/marketing/CookieConsent.tsx"), "utf8");
    expect(bron).toContain("cookiebeleidLink(window.location.hostname)");
    expect(bron).not.toContain('href="/cookiebeleid"');
  });
});
