import { describe, expect, it } from "vitest";
import { parseVersie } from "@/lib/bouwer/versie";
import { agentLeeft, isBezig, migratiesUitBestanden, type LiveStatus } from "@/lib/bouwer/live";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("parseVersie", () => {
  it("leest een door git archive ingevuld VERSIE-bestand", () => {
    expect(parseVersie(`${SHA}\n2026-11-03T12:00:00+01:00\nfeat(x): iets nieuws\n`)).toEqual({
      sha: SHA,
      datum: "2026-11-03T12:00:00+01:00",
      onderwerp: "feat(x): iets nieuws",
    });
  });

  it("herkent het niet-ingevulde bestand (lokaal) als onbekend", () => {
    expect(parseVersie("$Format:%H%n%cI%n%s$\n")).toBeNull();
    expect(parseVersie("")).toBeNull();
  });
});

describe("migratiesUitBestanden", () => {
  it("pakt alleen toegevoegde migration.sql-bestanden, gesorteerd en uniek", () => {
    expect(
      migratiesUitBestanden([
        { filename: "prisma/migrations/20261103120000_rijschool/migration.sql", status: "added" },
        { filename: "prisma/migrations/20261101090000_oud/migration.sql", status: "modified" },
        { filename: "prisma/migrations/20261102000000_a/migration.sql", status: "added" },
        { filename: "prisma/schema.prisma", status: "modified" },
        { filename: "prisma/migrations/migration_lock.toml", status: "added" },
      ]),
    ).toEqual(["20261102000000_a", "20261103120000_rijschool"]);
  });
});

describe("agentLeeft", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  it("leeft binnen 90 seconden na de laatste hartslag", () => {
    expect(agentLeeft({ op: "2026-11-03T11:59:00Z", host: "vps", versie: 1, bezig: false }, now)).toBe(true);
    expect(agentLeeft({ op: "2026-11-03T11:58:00Z", host: "vps", versie: 1, bezig: false }, now)).toBe(false);
    expect(agentLeeft(null, now)).toBe(false);
  });
});

describe("isBezig", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const basis: LiveStatus = {
    id: "live_1",
    actie: "uitrollen",
    staat: "bezig",
    stap: "Bouwen",
    bericht: "",
    door: "admin@zekerflex.com",
    begon: "2026-11-03T11:50:00Z",
    bijgewerkt: "2026-11-03T11:55:00Z",
    migraties: [],
  };
  it("een lopende uitrol blokkeert een nieuwe", () => {
    expect(isBezig(basis, now)).toBe(true);
  });
  it("een uitrol die 45 minuten niets meldt, telt als vastgelopen", () => {
    expect(isBezig({ ...basis, bijgewerkt: "2026-11-03T11:10:00Z" }, now)).toBe(false);
  });
  it("een afgeronde uitrol blokkeert niet", () => {
    expect(isBezig({ ...basis, staat: "klaar" }, now)).toBe(false);
    expect(isBezig(null, now)).toBe(false);
  });
});
