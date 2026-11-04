import { describe, expect, it } from "vitest";
import { amsterdamLocalInput, parseAmsterdamLocal } from "@/lib/time/amsterdam";

// Klus bewerken toont de tijden in een datetime-local-veld (Nederlandse tijd) en
// de server leest ze met parseAmsterdamLocal terug: dat moet heen en terug
// hetzelfde tijdstip zijn, ook rond de overgang naar zomer- en wintertijd.

describe("amsterdamLocalInput ↔ parseAmsterdamLocal", () => {
  it("wintertijd: 09:00 in Nederland is 08:00 UTC", () => {
    const d = new Date("2026-11-05T08:00:00Z");
    expect(amsterdamLocalInput(d)).toBe("2026-11-05T09:00");
    expect(parseAmsterdamLocal("2026-11-05T09:00").toISOString()).toBe(d.toISOString());
  });

  it("zomertijd: 09:00 in Nederland is 07:00 UTC", () => {
    const d = new Date("2026-07-01T07:00:00Z");
    expect(amsterdamLocalInput(d)).toBe("2026-07-01T09:00");
    expect(parseAmsterdamLocal(amsterdamLocalInput(d)).getTime()).toBe(d.getTime());
  });

  it("heen en terug gelijk, de hele dag rond de wissel naar wintertijd", () => {
    for (let h = 0; h < 30; h++) {
      const d = new Date(Date.UTC(2026, 9, 24, 20 + h, 15)); // 24 okt 20:15 UTC + h uur
      if (amsterdamLocalInput(d).startsWith("2026-10-25T02")) continue; // dat uur bestaat twee keer
      expect(parseAmsterdamLocal(amsterdamLocalInput(d)).getTime(), d.toISOString()).toBe(d.getTime());
    }
  });
});
