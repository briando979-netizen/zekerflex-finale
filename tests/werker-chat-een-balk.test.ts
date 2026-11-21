import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De chat van de werker op de telefoon (/dashboard/berichten), 20 nov 2026:
// - onderin stonden twee balken boven elkaar: de onderbalk van de app en de tabs van de chat;
//   de tabs staan daar nu bovenaan de lijst (prop tabsBoven), vanaf md blijven ze onderaan;
// - "Mijn status" nam ruim 100 px in; in de werker-app is het één regel (prop statusCompact).
// De opdrachtgever en beheer geven de props niet mee: daar verandert niets.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("werker-chat: één balk onderin op de telefoon", () => {
  const inbox = lees("components/chat/InboxPage.tsx");

  it("de werkerpagina zet de tabs bovenaan; opdrachtgever en beheer niet", () => {
    const werker = lees("app/dashboard/berichten/page.tsx");
    expect(werker).toContain("tabsBoven");
    for (const f of ["app/werkgever/berichten/page.tsx", "app/admin/berichten/page.tsx"]) {
      expect(lees(f), f).not.toContain("tabsBoven");
    }
  });

  it("de prop staat standaard uit, dus zonder prop is alles zoals het was", () => {
    expect(inbox).toContain("tabsBoven = false,");
    // de gewone balk: onderaan, altijd zichtbaar, met dezelfde klassen als voorheen
    expect(inbox).toContain('`${tabsBoven ? "hidden md:grid" : "grid"} flex-shrink-0 grid-cols-5 border-t border-hair bg-white`');
  });

  it("met tabsBoven is er op elke breedte precies één balk: boven tot md, onder vanaf md", () => {
    expect(inbox).toContain('{tabsBoven && tabBalk("boven")}');
    expect(inbox).toContain('{tabBalk("onder")}');
    expect(inbox).toContain('"grid flex-shrink-0 grid-cols-5 bg-white pb-1 md:hidden"');
    // de balk bovenaan staat vóór het zoekveld, de balk onderaan na de lijst
    expect(inbox.indexOf('{tabsBoven && tabBalk("boven")}')).toBeLessThan(inbox.indexOf("placeholder={ib.zoekPlaceholder}"));
    expect(inbox.indexOf('{tabBalk("onder")}')).toBeGreaterThan(inbox.indexOf('{tab === "settings" && ('));
  });

  it("alle vijf tabs blijven bereikbaar, in één lijst die beide plekken delen", () => {
    for (const k of ["chats", "updates", "calls", "tools", "settings"]) {
      expect(inbox.split(`["${k}", Icon`).length - 1, k).toBe(1);
    }
    expect(inbox).toContain("onClick={() => setTab(k)}");
  });
});

describe("chat: geen Mijn status meer", () => {
  it("de statusrij zoals in WhatsApp staat niet meer boven de gesprekken (21 nov 2026, eigenaar: niet relevant)", () => {
    const inbox = lees("components/chat/InboxPage.tsx");
    expect(inbox).not.toContain("<StatusRij");
    expect(inbox).not.toContain("statusCompact");
    expect(lees("app/dashboard/berichten/page.tsx")).not.toContain("statusCompact");
  });
});
