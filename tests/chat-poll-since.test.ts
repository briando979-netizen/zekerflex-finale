import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lijstVersie, sinceUitUrl } from "@/lib/messaging/poll-versie";
import { beoordeelPollAntwoord, sinceQuery } from "@/lib/messaging/poll-since";

// De zuinige poll van de chat (14 nov 2026): de server geeft een versie over alles wat de lijst toont; met ?since=<versie>
// komt bij "ongewijzigd" alleen de aanwezigheid terug. De client gelooft dat alleen voor zijn eigen versie en valt bij twijfel
// terug op de volledige lijst. Puur: server- en clientlogica apart, plus bronbewakers op de route en InboxPage.

const bericht = (over: Record<string, unknown> = {}) => ({ id: "m1", from: "u1", at: "2026-11-14T08:00:00.000Z", text: "hoi", kind: "text", readByOthers: false, ...over });
const delen = (berichten: unknown[], pinned: unknown = null) => ({ berichten, pinned, participants: ["u1", "u2"], subject: null, title: null, blocked: null, disappearDays: 0 });

describe("lijstVersie (server)", () => {
  it("is vast voor dezelfde lijst en 16 hex-tekens", () => {
    const a = lijstVersie(delen([bericht()]));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(lijstVersie(delen([bericht()]))).toBe(a);
  });

  it("verandert bij een nieuw bericht én bij elke wijziging van een oud bericht", () => {
    const basis = lijstVersie(delen([bericht()]));
    const anders = [
      delen([bericht(), bericht({ id: "m2" })]),
      delen([bericht({ text: "hoi!", editedAt: "2026-11-14T08:01:00.000Z" })]),
      delen([bericht({ deleted: true })]),
      delen([bericht({ reactions: { "👍": ["u2"] } })]),
      delen([bericht({ readByOthers: true })]),
      delen([bericht({ kind: "poll", poll: { question: "Waar?", options: [{ text: "A", votes: ["u2"] }] } })]),
      delen([bericht()], { id: "m1", excerpt: "hoi" }),
      { ...delen([bericht()]), participants: ["u1", "u2", "u3"] },
      { ...delen([bericht()]), blocked: "me" },
    ];
    for (const d of anders) expect(lijstVersie(d), JSON.stringify(d).slice(0, 80)).not.toBe(basis);
  });

  it("sinceUitUrl neemt alleen een echte versie aan", () => {
    expect(sinceUitUrl("http://app:3000/api/inbox/t1?visible=1&since=0123456789abcdef")).toBe("0123456789abcdef");
    expect(sinceUitUrl("http://app:3000/api/inbox/t1?visible=1")).toBeNull();
    expect(sinceUitUrl("http://app:3000/api/inbox/t1?since=xyz")).toBeNull();
    expect(sinceUitUrl("http://app:3000/api/inbox/t1?since=0123456789abcdef0")).toBeNull();
  });
});

describe("poll-since (client)", () => {
  it("stuurt since alleen met een onthouden versie", () => {
    expect(sinceQuery(null)).toBe("");
    expect(sinceQuery(undefined)).toBe("");
    expect(sinceQuery("0123456789abcdef")).toBe("&since=0123456789abcdef");
  });

  it("ongewijzigd: alleen geloven voor precies onze eigen versie", () => {
    expect(beoordeelPollAntwoord({ ongewijzigd: true, versie: "aaaaaaaaaaaaaaaa", presence: {} }, "aaaaaaaaaaaaaaaa")).toEqual({ soort: "ongewijzigd", versie: "aaaaaaaaaaaaaaaa" });
    // een andere versie, of wij stuurden geen since: niet vertrouwen, volledige lijst halen
    expect(beoordeelPollAntwoord({ ongewijzigd: true, versie: "bbbbbbbbbbbbbbbb" }, "aaaaaaaaaaaaaaaa")).toEqual({ soort: "opnieuw-volledig" });
    expect(beoordeelPollAntwoord({ ongewijzigd: true, versie: "aaaaaaaaaaaaaaaa" }, null)).toEqual({ soort: "opnieuw-volledig" });
  });

  it("een volledig antwoord: de lijst verwerken en de versie onthouden (of null bij een oude server)", () => {
    expect(beoordeelPollAntwoord({ versie: "cccccccccccccccc", messages: [] }, null)).toEqual({ soort: "volledig", versie: "cccccccccccccccc" });
    expect(beoordeelPollAntwoord({ messages: [{ id: "m1" }] }, "aaaaaaaaaaaaaaaa")).toEqual({ soort: "volledig", versie: null });
  });

  it("alles anders is twijfel: volledige lijst zonder since", () => {
    for (const d of [null, undefined, "tekst", {}, { versie: "x" }, { messages: "geen lijst" }]) {
      expect(beoordeelPollAntwoord(d, "aaaaaaaaaaaaaaaa")).toEqual({ soort: "opnieuw-volledig" });
    }
  });
});

describe("route en InboxPage volgen de regels", () => {
  it("de route antwoordt bij een gelijke since met alleen ongewijzigd + versie + presence, en geeft anders de versie mee", () => {
    const s = readFileSync("app/api/inbox/[threadId]/route.ts", "utf8");
    expect(s).toContain('if (sinceUitUrl(req.url) === versie) return NextResponse.json({ ongewijzigd: true, versie, presence });');
    expect(s).toContain("const versie = lijstVersie({ berichten, pinned, participants: thread.participants");
    expect(s).toContain("blocked, disappearDays:");
    expect(s).toContain("      versie,\n      thread: {");
    // gelezen-vinkjes, vastgezet en de berichten zelf zitten in de versie
    expect(s.indexOf("readByOthers:")).toBeLessThan(s.indexOf("const versie = lijstVersie("));
    expect(s.indexOf("const pinned = (() => {")).toBeLessThan(s.indexOf("const versie = lijstVersie("));
  });

  it("InboxPage: since alleen uit de onthouden versie, ongewijzigd = alleen aanwezigheid, lokale wijziging wist de versie", () => {
    const s = readFileSync("components/chat/InboxPage.tsx", "utf8");
    expect(s).toContain("${threadQuery()}${sinceQuery(since)}");
    expect(s).toContain('if (uitslag.soort === "ongewijzigd") {\n      setPresence((p) => ({ ...p, ...d.presence }));\n      return;');
    expect(s).toContain("if (since) void loadThread(id);");
    expect(s).toContain("versieRef.current = uitslag.versie;");
    // alleen de poll en het wisselen van gesprek schrijven rechtstreeks; elke andere wijziging gaat via setMessages (versie weg)
    expect(s.match(/setMessagesRaw\(/g)?.length).toBe(3);
    expect(s).toContain("versieRef.current = null;\n    setMessagesRaw(v);");
    // de chatregels blijven: sticky scroll op het laatste id, optimistisch met failed + Opnieuw
    expect(s).toContain("useStickyScroll(");
    expect(s).toContain("failed: reason");
  });
});
