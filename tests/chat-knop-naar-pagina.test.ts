import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { berichtenAdres, berichtenBasis } from "@/lib/chat/berichten-adres";
import { INBOX_NL } from "@/lib/chat/teksten-inbox";
import { INBOX_EN, INBOX_PL, INBOX_RO, INBOX_UK } from "@/lib/chat/teksten-inbox-talen";

// 17 nov 2026, eigenaar: "ik kan niet op berichten klikken". De knop "Bericht" bij een kandidaat (en "Bericht de
// opdrachtgever", "Chat met Support" en de recente gesprekken op het werkgeversstartscherm) stuurde een signaal "zf:chat"
// naar het chatvenster in de hoek. Dat venster staat uit (hideDock in ChatDock), dus er gebeurde niets zichtbaars; de
// dock stuurde wél stil een "Hallo!". Nu gaan die knoppen naar de chatpagina, die het gesprek uit de adresbalk opent.
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("het adres van de chatpagina", () => {
  it("volgt de omgeving: werkgever, beheer, anders de werker-app", () => {
    expect(berichtenBasis("/werkgever/diensten/abc")).toBe("/werkgever");
    expect(berichtenBasis("/werkgever")).toBe("/werkgever");
    expect(berichtenBasis("/admin/gebruikers/x")).toBe("/admin");
    expect(berichtenBasis("/dashboard/klussen/abc")).toBe("/dashboard");
    expect(berichtenBasis(null)).toBe("/dashboard");
    // "/werkgevers-…" is geen werkgeversomgeving
    expect(berichtenBasis("/werkgeversinfo")).toBe("/dashboard");
  });

  it("zet wat de pagina moet openen in de adresbalk, netjes gecodeerd en begrensd", () => {
    expect(berichtenAdres("/werkgever/diensten/s1", { met: "u1", context: "shift:s1", onderwerp: "Op- & afbouw" })).toBe(
      "/werkgever/berichten?met=u1&context=shift%3As1&onderwerp=Op-+%26+afbouw",
    );
    expect(berichtenAdres("/dashboard/klussen/s1", { klus: "s1" })).toBe("/dashboard/berichten?klus=s1");
    expect(berichtenAdres("/dashboard/hulp", { support: true })).toBe("/dashboard/berichten?support=1");
    expect(berichtenAdres("/admin/gebruikers/u1", { met: "u1" })).toBe("/admin/berichten?met=u1");
    expect(berichtenAdres("/werkgever", {})).toBe("/werkgever/berichten");
    const lang = berichtenAdres("/werkgever", { met: "u1", onderwerp: "x".repeat(500) });
    expect(lang.length).toBeLessThan(200);
  });
});

describe("de knoppen sturen geen signaal meer naar het uitgeschakelde chatvenster", () => {
  it("Bericht, Bericht de opdrachtgever, Support en recente gesprekken gaan naar de chatpagina", () => {
    for (const f of ["components/app/ChatUserButton.tsx", "components/app/MessageEmployerButton.tsx", "components/app/RecentMessagesPanel.tsx"]) {
      const s = bron(f);
      expect(s, f).not.toContain('"zf:chat"');
      expect(s, f).toContain("router.push(");
    }
    expect(bron("components/app/ChatUserButton.tsx")).toContain("berichtenAdres(pathname, { met: toUserId, context: contextKey, onderwerp: subject })");
    expect(bron("components/app/MessageEmployerButton.tsx")).toContain("berichtenAdres(pathname, { klus: shiftId })");
    expect(bron("components/app/MessageEmployerButton.tsx")).toContain("berichtenAdres(pathname, { support: true })");
    expect(bron("components/app/RecentMessagesPanel.tsx")).toContain("?thread=${encodeURIComponent(t.id)}");
  });

  it("de chatpagina opent ?met=, ?klus= en ?support=1 één keer en haalt ze uit de adresbalk", () => {
    const s = bron("components/chat/InboxPage.tsx");
    expect(s).toContain('if (!["support", "met", "klus"].some((k) => q.has(k))) return;');
    expect(s).toContain('for (const k of ["support", "met", "klus", "context", "onderwerp"]) adres.searchParams.delete(k);');
    expect(s).toContain('else if (met) void startThreadWith(met, { contextKey: q.get("context") ?? undefined, subject: q.get("onderwerp") ?? undefined });');
    expect(s).toContain("else if (klus) void startKlusThread(klus);");
    // een bestaand gesprek wordt geopend, niet opnieuw gestart (geen tweede 👋)
    expect(s).toContain('const existing = threads.find((t) => t.kind === "direct" && t.participants.includes(userId));');
  });

  it("de eerste vraag aan de opdrachtgever staat in de vijf talen van de chat", () => {
    const alle = [INBOX_NL, INBOX_EN, INBOX_PL, INBOX_RO, INBOX_UK].map((d) => d.klusVraag);
    for (const t of alle) expect(t.length).toBeGreaterThan(10);
    expect(new Set(alle).size).toBe(5);
    expect(INBOX_NL.klusVraag).toBe("Hallo, ik heb een vraag over deze klus.");
  });
});

describe("/voorbeeld stuurt door naar het echte adres", () => {
  it("niet naar request.url (achter Caddy is dat 0.0.0.0:3000), maar naar APP_BASE_URL", () => {
    for (const f of ["app/voorbeeld/werkgever/route.ts", "app/voorbeeld/werker/route.ts"]) {
      const s = bron(f);
      expect(s, f).not.toContain("request.url)");
      expect(s, f).toContain("env.APP_BASE_URL)");
    }
  });
});
