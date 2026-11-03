import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { REKENTOOLS, rekentoolRows } from "@/lib/admin/insights/rekentools";

describe("rekentools in Admin → Sales", () => {
  it("joins views, uses and leads per tool", () => {
    const rows = rekentoolRows({
      views: { "/rekentools/wet-dba-check": 40, "/rekentools/zzp-uurtarief-berekenen": 12 },
      used: { "rekentool:wet-dba-check": 10, "rekentool:zzp-uurtarief": 5, "rekentool:onbekend": 99 },
      leads: { "/rekentools/wet-dba-check": 2 },
    });
    expect(rows.map((r) => r.key)).toEqual(REKENTOOLS.map((t) => t.key));
    expect(rows.find((r) => r.key === "wet-dba-check")).toMatchObject({ views: 40, used: 10, leads: 2 });
  });

  it("shows zeroes for a tool nobody used, and no leads column for the zzp tool", () => {
    const rows = rekentoolRows({ views: {}, used: {}, leads: {} });
    expect(rows.find((r) => r.key === "kosten-uitzendkracht")).toMatchObject({ views: 0, used: 0, leads: 0 });
    expect(rows.find((r) => r.key === "zzp-uurtarief")?.leads).toBeNull();
  });

  it("uses the same event labels as useEersteGebruik in the tools", () => {
    // components/marketing/rekentools/*: useEersteGebruik("kosten-uitzendkracht" | "wet-dba-check" | "zzp-uurtarief")
    expect(REKENTOOLS.map((t) => t.key).sort()).toEqual(["kosten-uitzendkracht", "wet-dba-check", "zzp-uurtarief"]);
  });
});
