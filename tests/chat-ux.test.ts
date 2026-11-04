import { describe, expect, it } from "vitest";
import { dayLabel, emojiOnlyCount, firstUnreadId, lastSeenLabel, linkParts, listTime, threadMatches, type Msg } from "@/components/chat/shared";

// woensdag 4 november 2026, 14:00 Nederlandse tijd (13:00 UTC)
const NOW = new Date("2026-11-04T13:00:00Z");

const msg = (id: string, from: string, kind: Msg["kind"] = "text"): Msg => ({ id, from, at: NOW.toISOString(), text: id, kind });

describe("chat: tijden in Nederlandse tijd", () => {
  it("lijst: vandaag de klok, gisteren, weekdag, daarna de datum", () => {
    expect(listTime("2026-11-04T08:05:00Z", NOW)).toBe("09:05");
    expect(listTime("2026-11-03T22:30:00Z", NOW)).toBe("Gisteren"); // 23:30 op 3 nov
    expect(listTime("2026-10-31T10:00:00Z", NOW)).toBe("zaterdag");
    expect(listTime("2026-10-20T10:00:00Z", NOW)).toBe("20-10-26");
  });

  it("net na middernacht in Nederland is al 'vandaag', ook al is het in UTC nog gisteren", () => {
    expect(listTime("2026-11-03T23:30:00Z", NOW)).toBe("00:30");
  });

  it("dagkop: Vandaag, Gisteren, weekdag, datum, ander jaar met jaartal", () => {
    expect(dayLabel("2026-11-04T06:00:00Z", NOW)).toBe("Vandaag");
    expect(dayLabel("2026-11-03T06:00:00Z", NOW)).toBe("Gisteren");
    expect(dayLabel("2026-11-01T06:00:00Z", NOW)).toBe("zondag");
    expect(dayLabel("2026-10-12T06:00:00Z", NOW)).toBe("12 oktober");
    expect(dayLabel("2025-12-24T06:00:00Z", NOW)).toBe("24 december 2025");
  });

  it("laatst gezien in Nederlandse tijd", () => {
    expect(lastSeenLabel({ online: true, lastSeen: null }, NOW)).toBe("online");
    expect(lastSeenLabel({ online: false, lastSeen: "2026-11-04T11:15:00Z" }, NOW)).toBe("laatst gezien om 12:15");
    expect(lastSeenLabel({ online: false, lastSeen: "2026-11-03T19:00:00Z" }, NOW)).toBe("laatst gezien gisteren om 20:00");
    expect(lastSeenLabel(undefined, NOW)).toBe("");
  });
});

describe("chat: links in berichten", () => {
  it("maakt http(s)- en www-links aanklikbaar, leestekens erachter horen bij de zin", () => {
    expect(linkParts("Kijk op https://zekerflex.nl/klus/1. Tot zo")).toEqual([
      { link: false, text: "Kijk op " },
      { link: true, text: "https://zekerflex.nl/klus/1", href: "https://zekerflex.nl/klus/1" },
      { link: false, text: ". Tot zo" },
    ]);
    expect(linkParts("(www.voorbeeld.nl)")).toEqual([
      { link: false, text: "(" },
      { link: true, text: "www.voorbeeld.nl", href: "https://www.voorbeeld.nl" },
      { link: false, text: ")" },
    ]);
  });

  it("geen javascript:-links en gewone tekst blijft één stuk", () => {
    expect(linkParts("javascript:alert(1)").every((p) => !p.link)).toBe(true);
    expect(linkParts("gewoon een zin")).toEqual([{ link: false, text: "gewoon een zin" }]);
  });
});

describe("chat: alleen emoji groot tonen", () => {
  it("1 tot 3 emoji", () => {
    expect(emojiOnlyCount("👍")).toBe(1);
    expect(emojiOnlyCount("😂😂")).toBe(2);
    expect(emojiOnlyCount(" ❤️ 🙏 👍 ")).toBe(3);
    expect(emojiOnlyCount("👨‍👩‍👧")).toBe(1); // gezin = één teken
  });

  it("tekst, cijfers of te veel emoji: gewoon in een bubbel", () => {
    expect(emojiOnlyCount("ok 👍")).toBe(0);
    expect(emojiOnlyCount("👍👍👍👍")).toBe(0);
    expect(emojiOnlyCount("123")).toBe(0);
    expect(emojiOnlyCount("")).toBe(0);
  });
});

describe("chat: zoeken in de lijst en ongelezen-streep", () => {
  it("zoekt op naam, bericht of klus, zonder hoofdletters en accenten", () => {
    expect(threadMatches("jose", "José Álvarez", null)).toBe(true);
    expect(threadMatches("BARDIENST", "Anna", "hoi", "Bardienst vrijdag")).toBe(true);
    expect(threadMatches("xyz", "Anna", "hoi")).toBe(false);
    expect(threadMatches("  ", "Anna")).toBe(true);
  });

  it("eerste ongelezen = het n-de bericht van de ander, van achteren geteld", () => {
    const list = [msg("a", "ander"), msg("b", "ik"), msg("c", "ander"), msg("d", "ander", "system"), msg("e", "ander")];
    expect(firstUnreadId(list, 1, "ik")).toBe("e");
    expect(firstUnreadId(list, 2, "ik")).toBe("c");
    expect(firstUnreadId(list, 3, "ik")).toBe("a");
    expect(firstUnreadId(list, 0, "ik")).toBeNull();
    expect(firstUnreadId(list, 9, "ik")).toBeNull();
  });
});
