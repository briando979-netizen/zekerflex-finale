import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 22 nov 2026 (gebruikersonderzoek punt 13): op de telefoon lagen de cookiemelding (een derde van het eerste scherm), de
// bezoekerstip en de chatknop over elkaar. Het uiterlijk vanaf 640 px blijft precies zoals het was.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("niets over elkaar op de telefoon", () => {
  it("de cookiemelding is op de telefoon een smalle balk; vanaf 640 px en met de instellingen open de kaart van daarvoor", () => {
    const s = lees("components/marketing/CookieConsent.tsx");
    expect(s).toContain('data-cookie-balk className="flex items-center gap-3 sm:hidden"');
    expect(s).toContain('<div className={showDetails ? "" : "hidden sm:block"}>');
    // de kaart vanaf 640 px: dezelfde klassen als daarvoor (rounded-2xl, border, p-5, px-6, pb-4)
    expect(s).toContain("sm:rounded-2xl sm:border sm:p-5");
    expect(s).toContain('"px-0 pb-0 sm:pb-4"} sm:px-6');
    for (const taal of ["nl", "en", "pl", "ro", "uk"]) expect(s).toMatch(new RegExp(`${taal}: \\{ label: "[^"]+", kort: "[^"]+", beleidKort: "[^"]+"`));
  });

  it("de bezoekerstip komt niet op de telefoon, en zolang hij open is wijkt de chatknop", () => {
    const s = lees("components/marketing/VisitorNudge.tsx");
    expect(s).toContain('const TELEFOON = "(max-width: 639px)";');
    expect(s).toContain("if (window.matchMedia?.(TELEFOON).matches) return;");
    expect(s).toContain('html.dataset.tipOpen = "1";');
    expect(s).toContain("delete html.dataset.tipOpen;");
    expect(lees("app/globals.css")).toContain('html[data-tip-open] button[aria-label="Chat openen"] { visibility: hidden; }');
    // de regel hangt aan het label van de chatknop: blijft dat zo heten?
    expect(lees("components/marketing/ChatWidget.tsx")).toContain('aria-label={open ? "Chat sluiten" : "Chat openen"}');
  });
});
