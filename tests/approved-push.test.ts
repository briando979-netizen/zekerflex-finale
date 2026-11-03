import { describe, expect, it } from "vitest";
import { approvedPushText } from "@/lib/notifications/approved-push";

// "✅ Je uren zijn goedgekeurd" — wat de werker hoort zodra zijn uren zijn
// goedgekeurd, per spoor (zzp-factuur of uitzend-verloning).

const base = { timesheetId: "ts1", billableMinutes: 450, payout: null, payroll: null, advance: null };

describe("approvedPushText", () => {
  it("zzp: noemt het bedrag dat onderweg is", () => {
    const t = approvedPushText({ ...base, track: "invoice", payout: { amountCents: 13500 } }, "Magazijn");
    expect(t.title).toBe("✅ Je uren zijn goedgekeurd");
    expect(t.body).toBe("Magazijn: 7,5 uur. € 135,00 is onderweg naar je rekening.");
  });

  it("zzp zonder directe uitbetaling: volgt de gekozen snelheid", () => {
    expect(approvedPushText({ ...base, track: "invoice" }, "Magazijn").body).toBe(
      "Magazijn: 7,5 uur. Je uitbetaling volgt volgens de snelheid die je koos.",
    );
  });

  it("uitzend: loon via de weekverloning, met voorschot als dat er is", () => {
    expect(approvedPushText({ ...base, track: "payroll", payroll: { weekLabel: "week 45" } }, "Kassa").body).toBe(
      "Kassa: 7,5 uur. Je loon volgt met de verloning van week 45.",
    );
    expect(
      approvedPushText({ ...base, track: "payroll", payroll: { weekLabel: "week 45" }, advance: { netCents: 9000 } }, "Kassa").body,
    ).toBe("Kassa: 7,5 uur. Je voorschot van € 90,00 is onderweg; de rest volgt met de verloning van week 45.");
  });
});
