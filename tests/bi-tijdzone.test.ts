import { describe, expect, it } from "vitest";
import { BI_VIEWS, inrichtSql, nlTijd, sqlTekst } from "@/lib/bi/views";

// Metabase-views in Nederlandse tijd (15 nov 2026). Prisma slaat tijden op als timestamp zonder zone met UTC erin;
// "x AT TIME ZONE 'Europe/Amsterdam'" las die als Nederlandse tijd: een dienst om 09:00 stond in Metabase op 07:00.

describe("bi: tijden", () => {
  it("een kolom wordt eerst als UTC gelezen en dan naar Nederlandse tijd gezet", () => {
    expect(nlTijd('s."startsAt"')).toBe(`((s."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Amsterdam')`);
  });

  it("geen enkele view zet een kolom nog rechtstreeks naar Europe/Amsterdam", () => {
    for (const v of BI_VIEWS) {
      const zonderGoede = v.sql.split("AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Amsterdam'").join("");
      expect(zonderGoede, v.naam).not.toContain("AT TIME ZONE 'Europe/Amsterdam'");
    }
    // te laat: dueAt (UTC zonder zone) tegen nu in UTC, los van de tijdzone van de sessie
    expect(BI_VIEWS.find((v) => v.naam === "facturen")?.sql).toContain(`i."dueAt" < (now() AT TIME ZONE 'UTC')`);
  });

  it("de inrichting vervangt eenmalig de views met een oude timestamptz-kolom, in afhankelijkheidsvolgorde", () => {
    const sql = inrichtSql(sqlTekst("abc123"));
    expect(sql[0]).toBe("CREATE SCHEMA IF NOT EXISTS bi");
    const eenmalig = sql[1] ?? "";
    expect(eenmalig).toMatch(/^DO \$\$ BEGIN IF EXISTS \(SELECT 1 FROM information_schema\.columns/);
    expect(eenmalig).toContain("data_type = 'timestamp with time zone'");
    expect(eenmalig).toContain("DROP VIEW IF EXISTS bi.maandoverzicht, bi.bezetting_per_week, bi.uren, bi.diensten;");
    expect(eenmalig).not.toContain("CASCADE");
    // daarna pas de views, in de volgorde waarin ze op elkaar bouwen
    expect(sql.findIndex((s) => s.startsWith("CREATE OR REPLACE VIEW bi.diensten"))).toBeGreaterThan(1);
  });
});
