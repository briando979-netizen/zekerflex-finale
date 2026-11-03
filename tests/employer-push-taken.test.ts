import { beforeEach, describe, expect, it, vi } from "vitest";

// De contactpersoon van een dienst krijgt meteen een pushbericht als een werker
// hem aanneemt ("✅ Sanne neemt je klus"), met de tijd in Nederlandse tijd.

const h = vi.hoisted(() => ({
  pushes: [] as { ids: string[]; push: { title: string; body: string; data: { url: string } } }[],
  contact: { userId: "mgr1", name: "Manager", branch: "Hal 1", shiftTitle: "Magazijn" } as { userId: string } | null,
  assigned: 1,
}));

vi.mock("@/lib/messaging/contacts", () => ({ resolveShiftContact: async () => h.contact }));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: (typeof h.pushes)[number]["push"]) => (h.pushes.push({ ids, push }), 1),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findUnique: async () => ({
        title: "Magazijn",
        startsAt: new Date("2026-11-05T08:00:00Z"), // do 5 nov 09:00 NL
        positions: 2,
        _count: { assignments: h.assigned },
      }),
    },
  },
}));

import { pushHoursSubmitted, pushShiftTaken } from "@/lib/notifications/employer-push";

beforeEach(() => {
  h.pushes.length = 0;
  h.contact = { userId: "mgr1" };
  h.assigned = 1;
});

describe("pushShiftTaken", () => {
  it("meldt de werker, de klus, de Nederlandse tijd en hoeveel plekken er nog open zijn", async () => {
    await pushShiftTaken("sh1", "Sanne de Vries");
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]?.ids).toEqual(["mgr1"]);
    expect(h.pushes[0]?.push.title).toBe("✅ Sanne de Vries neemt je klus");
    expect(h.pushes[0]?.push.body).toMatch(/^Magazijn, do 5 nov\.? 09:00\. Nog 1 plek open\.$/);
    expect(h.pushes[0]?.push.data.url).toBe("/werkgever/diensten/sh1");
  });

  it("zegt het als de klus vol is, en noemt het aantal dagen bij een reeks", async () => {
    h.assigned = 2;
    await pushShiftTaken("sh1", "Sanne", 3);
    expect(h.pushes[0]?.push.body).toMatch(/^Magazijn, 3 dagen vanaf do 5 nov\.? 09:00\. De klus is nu vol\.$/);
  });

  it("meldt ingediende uren met het aantal uur, en verwijst naar het goedkeuren", async () => {
    await pushHoursSubmitted("sh1", "ts1", "Sanne", 450);
    expect(h.pushes[0]?.push.title).toBe("🕒 Uren ingediend: Sanne");
    expect(h.pushes[0]?.push.body).toBe("Magazijn, do 5 nov 09:00: 7,5 uur. Keur ze goed, dan wordt er uitbetaald.");
    expect(h.pushes[0]?.push.data.url).toBe("/werkgever/uren");
  });

  it("stuurt niets als er geen contactpersoon is", async () => {
    h.contact = null;
    await pushShiftTaken("sh1", "Sanne");
    expect(h.pushes).toHaveLength(0);
  });
});
