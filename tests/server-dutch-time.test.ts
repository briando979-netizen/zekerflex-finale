import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesCampaign } from "@prisma/client";

// Alles wat de server (in UTC) over tijd zegt of beslist, moet de Nederlandse
// klok volgen: agendalinks, het verzendvenster van de outreach, demodatums,
// herhaalde diensten en "laatst gezien". Elke test draait met de server in UTC.

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ redis: {} }));

import { googleCalendarUrl, localStamp } from "@/lib/calendar/links";
import { startOfToday, withinSendWindow } from "@/lib/sales/campaign";
import { isSelectableDemoDate } from "@/lib/demo/slots";
import { detectSeries } from "@/lib/shifts/series";
import { formatLastSeen } from "@/lib/messaging/presence";

const ORIGINAL_TZ = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "UTC";
});
afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("agendalinks", () => {
  it("zetten een dienst van 09:00 om 09:00 in de agenda (de link zegt Europe/Amsterdam)", () => {
    expect(localStamp("2026-11-03T08:00:00Z")).toBe("2026-11-03T09:00:00");
    expect(localStamp("2026-07-03T07:00:00Z")).toBe("2026-07-03T09:00:00");
    const url = googleCalendarUrl({
      title: "Dienst",
      startLocal: localStamp("2026-11-03T08:00:00Z"),
      endLocal: localStamp("2026-11-03T16:00:00Z"),
      location: "Rotterdam",
      description: "",
    });
    expect(decodeURIComponent(url)).toContain("20261103T090000/20261103T170000");
  });
});

describe("verzendvenster outreach", () => {
  const campaign = { id: "c1", name: "Test", sendStartHour: 9, sendEndHour: 17, workdaysOnly: true } as unknown as SalesCampaign;

  it("volgt 9–17 uur Nederlandse tijd", () => {
    expect(withinSendWindow(campaign, new Date("2026-11-03T08:30:00Z"))).toBe(true); // di 09:30
    expect(withinSendWindow(campaign, new Date("2026-11-03T07:30:00Z"))).toBe(false); // di 08:30
    expect(withinSendWindow(campaign, new Date("2026-11-03T16:30:00Z"))).toBe(false); // di 17:30
  });

  it("de dagteller begint om middernacht in Nederland", () => {
    expect(startOfToday(new Date("2026-11-02T23:30:00Z")).toISOString()).toBe("2026-11-02T23:00:00.000Z");
  });
});

describe("demodatums", () => {
  it("vandaag in Nederland is niet te kiezen, morgen wel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T23:30:00Z")); // di 3 nov 00:30 in NL
    expect(isSelectableDemoDate("2026-11-03")).toBe(false);
    expect(isSelectableDemoDate("2026-11-04")).toBe(true);
    expect(isSelectableDemoDate("2026-11-07")).toBe(false); // zaterdag
    expect(isSelectableDemoDate("2026-02-30")).toBe(false); // bestaat niet
  });
});

describe("herhaalde diensten", () => {
  it("blijven één reeks over de wissel naar wintertijd heen", () => {
    const shift = (id: string, startsAt: string) => ({ id, title: "Orderpicker", branchId: "b1", startsAt: new Date(startsAt), positions: 2, taken: 0 });
    const series = detectSeries([shift("a", "2026-10-23T07:00:00Z"), shift("b", "2026-10-27T08:00:00Z")]); // beide 09:00 NL
    expect(series.get("a")?.total).toBe(2);
    expect(series.get("a")?.days.map((d) => `${d.weekday} ${d.date}`)).toEqual(["vr 2026-10-23", "di 2026-10-27"]);
  });
});

describe("laatst gezien", () => {
  it("telt vandaag en de tijd op de Nederlandse klok", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T08:00:00Z"));
    expect(formatLastSeen({ online: false, lastSeen: "2026-11-02T23:30:00Z" })).toBe("laatst gezien vandaag om 00:30");
    expect(formatLastSeen({ online: false, lastSeen: "2026-11-02T20:00:00Z" })).toBe("laatst gezien gisteren om 21:00");
  });
});
