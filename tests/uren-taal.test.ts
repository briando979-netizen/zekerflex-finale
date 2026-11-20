import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("uitleg bij automatisch goedkeuren: kort en zonder vaktaal", () => {
  it("twee gewone zinnen, in beide talen", () => {
    for (const [taal, tekst] of [["nl", nl.autoGoedkeuren.uitleg], ["en", en.autoGoedkeuren.uitleg]] as const) {
      expect(tekst, taal).not.toMatch(/autopilot|GPS|fraud/i);
      expect(tekst.split(". ").length, taal).toBe(2);
      expect(tekst.length, taal).toBeLessThan(180);
      expect(tekst, taal).toContain("24");
      expect(tekst, taal).toContain("ZekerFlex");
    }
    expect(nl.autoGoedkeuren.uitleg).toMatch(/planning en het inchecken/);
    expect(nl.autoGoedkeuren.uitleg).toMatch(/altijd weer uitzetten/);
    expect(en.autoGoedkeuren.uitleg).toMatch(/turn this off/);
  });
});

describe("het scherm Uren goedkeuren: tellers alleen als er iets te tellen valt", () => {
  const bron = readFileSync(join(process.cwd(), "app/werkgever/uren/page.tsx"), "utf8");

  it("de vier vakken staan achter ietsTeTellen", () => {
    expect(bron).toContain("const ietsTeTellen = timesheets.length > 0;");
    const start = bron.indexOf("{ietsTeTellen && (");
    expect(start).toBeGreaterThan(-1);
    const eind = bron.indexOf("{flaggedCount > 0 && (");
    expect(eind).toBeGreaterThan(start);
    const blok = bron.slice(start, eind);
    for (const sleutel of ["h.kpiOpen}", "h.kpiAmount}", "h.kpiDisputed}", "h.kpiOldest}"]) {
      expect(blok, sleutel).toContain(sleutel);
      // en nergens buiten het blok
      expect(bron.split(sleutel).length, sleutel).toBe(2);
    }
  });

  it("het lege vak en het vakje automatisch goedkeuren blijven altijd staan", () => {
    expect(bron).toContain("<EmptyState title={h.emptyTitle} body={h.emptyBody} />");
    const start = bron.indexOf("{ietsTeTellen && (");
    expect(bron.indexOf("<AutoApproveToggle />")).toBeLessThan(start);
    expect(bron.indexOf("<AutoApproveToggle />")).toBeGreaterThan(-1);
  });
});
