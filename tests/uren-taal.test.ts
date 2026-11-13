import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { bulkBericht, bulkBerichtT } from "@/lib/timesheets/bulk-goedkeuren";

// Werkgever → Uren in Nederlands en Engels: de meldingen van de server-acties (urenActies) en de knoppen (urenKnoppen, autoGoedkeuren).
// Nederlands blijft woord voor woord wat er stond.

describe("bulkberichten uit het woordenboek", () => {
  it("Nederlands is gelijk aan bulkBericht, voor alle combinaties", () => {
    for (const g of [0, 1, 3]) for (const m of [0, 1, 2]) for (const o of [0, 1, 4]) {
      expect(bulkBerichtT(nl.urenActies, g, m, o), `${g} ${m} ${o}`).toBe(bulkBericht(g, m, o));
    }
  });

  it("Engels: enkelvoud en meervoud, en de lege melding", () => {
    expect(bulkBerichtT(en.urenActies, 1, 0, 0)).toBe("1 timesheet approved.");
    expect(bulkBerichtT(en.urenActies, 3, 2, 1)).toBe("3 timesheets approved. 2 failed: approve those separately to see the reason. 1 skipped: already processed, or a signal appeared.");
    expect(bulkBerichtT(en.urenActies, 0, 0, 0)).toBe("There was nothing to approve.");
  });
});

describe("de Nederlandse teksten zijn gelijk aan wat er stond", () => {
  it("meldingen van de acties", () => {
    expect(nl.urenActies.voorschot.replace("{bedrag}", "12,50").replace("{week}", "2026-W45")).toBe("Goedgekeurd. € 12,50 is als voorschot uitbetaald; de rest volgt op de loonstrook van week 2026-W45.");
    expect(nl.urenActies.payroll.replace("{week}", "2026-W45")).toBe("Goedgekeurd. De uren worden verloond in de payroll van week 2026-W45.");
    expect(nl.urenActies.uitbetalingGestart).toBe("Goedgekeurd en uitbetaling gestart.");
    expect(nl.urenActies.controleAangevraagd).toBe("Platformcontrole aangevraagd — dit urenbriefje wordt door ZekerFlex beoordeeld.");
    expect(nl.urenActies.voorstelVerstuurd).toBe("Correctievoorstel verstuurd — de flexwerker moet nog akkoord gaan.");
  });

  it("knoppen", () => {
    expect(nl.urenKnoppen.signaalStandaard).toBe("Dit urenbriefje heeft een signaal.");
    expect(nl.urenKnoppen.tochGoedkeuren).toBe("Toch goedkeuren?");
    expect(nl.autoGoedkeuren.kop).toBe("🤖 Uren automatisch goedkeuren");
    expect(nl.autoGoedkeuren.bevestig).toMatch(/^Automatisch goedkeuren aanzetten\? De AI keurt dan uren goed/);
  });
});
