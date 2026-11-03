import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (key: string) => (store.has(key) ? store.get(key) : null),
  kvSet: async (key: string, value: unknown) => {
    store.set(key, value);
  },
  kvDelete: async (key: string) => {
    store.delete(key);
  },
}));

import { feedIcs, userForFeedToken, workerFeedToken, type FeedAssignment } from "@/lib/worker/calendar-feed";

afterEach(() => store.clear());

function assignment(over: Partial<FeedAssignment> = {}, shift: Partial<FeedAssignment["shift"]> = {}): FeedAssignment {
  return {
    id: "as1",
    cancelledAt: null,
    ...over,
    shift: {
      id: "sh1",
      title: "Bediening, terras",
      status: "FILLED",
      // 09:00–17:00 Nederlandse wintertijd = 08:00–16:00 UTC
      startsAt: new Date("2026-11-10T08:00:00Z"),
      endsAt: new Date("2026-11-10T16:00:00Z"),
      breakMinutes: 30,
      dresscode: "Zwarte broek; wit shirt",
      updatedAt: new Date("2026-11-01T12:00:00Z"),
      branch: { name: "Café De Brug", addressLine: "Oudegracht 1", postalCode: "3511 AA", city: "Utrecht", tenant: { name: "De Brug BV" } },
      ...shift,
    },
  };
}

const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("feedIcs", () => {
  it("schrijft UTC-tijden met Z, zodat 09:00 ook 09:00 in je agenda is", () => {
    const ics = unfold(feedIcs([assignment()], "https://zekerflex.com"));
    expect(ics).toContain("DTSTART:20261110T080000Z");
    expect(ics).toContain("DTEND:20261110T160000Z");
    expect(ics).toContain("UID:shift-as1@zekerflex.com");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("TRIGGER:-PT2H");
    // komma's en puntkomma's ge-escaped
    expect(ics).toContain("SUMMARY:Bediening\\, terras · De Brug BV");
    expect(ics).toContain("Kleding: Zwarte broek\\; wit shirt");
    expect(ics).toContain("https://zekerflex.com/dashboard/klussen/sh1");
  });

  it("markeert een afgezegde dienst als CANCELLED zonder herinnering", () => {
    const ics = unfold(feedIcs([assignment({ cancelledAt: new Date("2026-11-05T09:30:00Z") })], "https://x"));
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SUMMARY:Gaat niet door: ");
    expect(ics).toContain("DTSTAMP:20261105T093000Z");
    expect(ics).not.toContain("BEGIN:VALARM");
    expect(unfold(feedIcs([assignment({}, { status: "CANCELLED" })], "https://x"))).toContain("STATUS:CANCELLED");
  });

  it("vouwt lange regels en eindigt met CRLF", () => {
    const ics = feedIcs([assignment({}, { title: "x".repeat(200) })], "https://x");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("agenda-link", () => {
  it("geeft steeds dezelfde link tot je hem vernieuwt; de oude werkt dan niet meer", async () => {
    const t1 = await workerFeedToken("u1");
    expect(await workerFeedToken("u1")).toBe(t1);
    expect(await userForFeedToken(t1)).toBe("u1");

    const t2 = await workerFeedToken("u1", true);
    expect(t2).not.toBe(t1);
    expect(await userForFeedToken(t1)).toBeNull();
    expect(await userForFeedToken(t2)).toBe("u1");
  });

  it("is dood zodra de eigen sleutel weg is (account verwijderd)", async () => {
    const t = await workerFeedToken("u1");
    store.delete("werker-agenda:u1");
    expect(await userForFeedToken(t)).toBeNull();
  });

  it("weigert rommel", async () => {
    expect(await userForFeedToken("kort")).toBeNull();
    expect(await userForFeedToken("../../etc/passwd-aaaaaaaaaaaaaaaaaaaaa")).toBeNull();
  });
});
