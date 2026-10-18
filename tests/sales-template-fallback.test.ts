import { describe, expect, it } from "vitest";
import { templateDraft } from "@/lib/sales/outreach";

const lead = { companyName: "Bakkerij De Korst", contactName: "Sanne de Vries", city: "Utrecht", sector: "Horeca", vacancySignal: "2 vacatures voor bakkershulp" };

describe("outreach template fallback (no model reachable)", () => {
  it("writes a personal intro using the vacancy signal", () => {
    const d = templateDraft(lead, 0);
    expect(d.subject).toContain("Bakkerij De Korst");
    expect(d.body).toContain("Beste Sanne,");
    expect(d.body).toContain("bakkershulp");
  });

  it("has a reminder and a polite breakup step", () => {
    expect(templateDraft(lead, 1).subject).toMatch(/^Nog even/);
    expect(templateDraft({ ...lead, contactName: null }, 2).body).toContain("Beste team van Bakkerij De Korst,");
  });
});
