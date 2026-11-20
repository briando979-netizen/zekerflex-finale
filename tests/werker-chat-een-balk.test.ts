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

  it("de werkerpagina zet de tabs bovenaan en de status compact; opdrachtgever en beheer niet", () => {
    const werker = lees("app/dashboard/berichten/page.tsx");
    expect(werker).toContain("tabsBoven");
    expect(werker).toContain("statusCompact");
    for (const f of ["app/werkgever/berichten/page.tsx", "app/admin/berichten/page.tsx"]) {
      expect(lees(f), f).not.toContain("tabsBoven");
      expect(lees(f), f).not.toContain("statusCompact");
    }
  });

  it("beide props staan standaard uit, dus zonder prop is alles zoals het was", () => {
    expect(inbox).toContain("tabsBoven = false,");
    expect(inbox).toContain("statusCompact = false,");
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

describe("werker-chat: Mijn status op één regel", () => {
  const rij = lees("components/chat/StatusRij.tsx");

  it("InboxPage geeft de keuze door; standaard blijft de gewone rij", () => {
    expect(lees("components/chat/InboxPage.tsx")).toContain("compact={statusCompact}");
    expect(rij).toContain("compact = false");
    // de gewone rij (48 px met de naam eronder) staat er nog voor de opdrachtgever
    expect(rij).toContain("size={48}");
    expect(rij).toContain("{t.statusTitel}");
  });

  it("de compacte regel houdt alle functies: eigen status bekijken of maken, de plus, en de contacten", () => {
    const start = rij.indexOf("{compact ? (");
    const eind = rij.indexOf(") : (", start);
    expect(start).toBeGreaterThan(-1);
    expect(eind).toBeGreaterThan(start);
    const compact = rij.slice(start, eind);
    expect(compact).toContain("mijnAantal ? open(myUserId) : setMaken(true)");
    expect(compact).toContain("aria-label={t.statusToevoegen}");
    expect(compact).toContain("open(a.userId)");
    expect(compact).toContain("{t.statusMijn}");
    expect(compact).toContain("size={28}");
    // één regel: geen kop en geen namen onder de rondjes
    expect(compact).not.toContain("flex-col");
    expect(compact).not.toContain("statusTitel");
  });

  it("maken en bekijken staan buiten de keuze, dus werken in beide vormen", () => {
    const naKeuze = rij.slice(rij.lastIndexOf("</>"));
    expect(naKeuze).toContain("<StatusMaker");
    expect(naKeuze).toContain("<StatusViewer");
  });
});
