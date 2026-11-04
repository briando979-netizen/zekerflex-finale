import { describe, expect, it } from "vitest";
import { laatsteActiviteit, scanOverzicht } from "@/lib/scans/overzicht";
import type { ScanLog, ScanStap } from "@/lib/scans/model";

const NU = new Date("2026-11-05T07:00:00Z");

function log(id: string, at: string, stappen: [ScanStap, string][] = [], host: string | null = `${id}.nl`): ScanLog {
  return {
    sleutel: `website:${id}`,
    soort: "website",
    scanId: id,
    at,
    host,
    naam: id,
    plaats: null,
    score: 60,
    samenvatting: "",
    rapport: `/website-check?r=${id}`,
    leadId: null,
    dealId: null,
    siteSlug: null,
    stappen: [{ stap: "gescand", at }, ...stappen.map(([stap, t]) => ({ stap, at: t }))],
  };
}

describe("dagoverzicht van de scans", () => {
  it("telt de scans van het afgelopen etmaal, zonder testsites", () => {
    const o = scanOverzicht([log("bakker", "2026-11-04T20:00:00Z"), log("oud", "2026-11-03T20:00:00Z"), log("test", "2026-11-04T21:00:00Z", [], "example.com")], NU);
    expect(o.nieuw.map((l) => l.naam)).toEqual(["bakker"]);
    expect(o.ietsNieuws).toBe(true);
  });

  it("zet contactaanvragen bovenaan de wachtlijst; wie al gemaild is of akkoord is, wacht niet", () => {
    const o = scanOverzicht(
      [
        log("keek", "2026-11-01T10:00:00Z", [["deal-bekeken", "2026-11-02T10:00:00Z"]]),
        log("vroeg", "2026-10-30T10:00:00Z", [["aanvraag", "2026-10-31T10:00:00Z"]]),
        log("gemaild", "2026-11-01T10:00:00Z", [["deal-bekeken", "2026-11-01T11:00:00Z"], ["opgevolgd", "2026-11-02T09:00:00Z"]]),
        log("ja", "2026-11-01T10:00:00Z", [["deal-akkoord", "2026-11-01T12:00:00Z"]]),
        log("bleef", "2026-11-01T10:00:00Z"),
      ],
      NU,
    );
    expect(o.wachten.map((l) => l.naam)).toEqual(["vroeg", "keek"]);
    // niets in het afgelopen etmaal: geen mail
    expect(o.ietsNieuws).toBe(false);
  });

  it("vergeet wie langer dan 14 dagen niets deed, en meldt een akkoord van gisteren", () => {
    const o = scanOverzicht([log("lang", "2026-10-10T10:00:00Z", [["aanvraag", "2026-10-11T10:00:00Z"]]), log("ja", "2026-11-03T10:00:00Z", [["deal-akkoord", "2026-11-04T18:00:00Z"]])], NU);
    expect(o.wachten).toEqual([]);
    expect(o.akkoord.map((l) => l.naam)).toEqual(["ja"]);
    expect(o.ietsNieuws).toBe(true);
  });

  it("noemt een bedrijf dat vaker scande één keer, en laat een al gemaild bedrijf niet opnieuw wachten", () => {
    const o = scanOverzicht(
      [
        log("a1", "2026-11-04T20:00:00Z", [["nieuwe-site", "2026-11-04T20:05:00Z"]], "www.marktzicht.nl"),
        log("a2", "2026-11-04T10:00:00Z", [["deal-bekeken", "2026-11-04T10:05:00Z"]], "marktzicht.nl"),
        log("b1", "2026-11-04T09:00:00Z", [["deal-bekeken", "2026-11-04T09:05:00Z"]], "bakker.nl"),
        log("b0", "2026-11-01T09:00:00Z", [["opgevolgd", "2026-11-02T09:00:00Z"]], "bakker.nl"),
      ],
      NU,
    );
    expect(o.nieuw.map((l) => l.naam)).toEqual(["a1", "b1"]);
    expect(o.wachten.map((l) => l.naam)).toEqual(["a1"]);
  });

  it("onze eigen opvolging telt niet als activiteit van de bezoeker", () => {
    const l = log("x", "2026-11-01T10:00:00Z", [["stijl", "2026-11-02T10:00:00Z"], ["opgevolgd", "2026-11-04T10:00:00Z"]]);
    expect(laatsteActiviteit(l)).toBe("2026-11-02T10:00:00Z");
  });
});
