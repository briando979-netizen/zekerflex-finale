import { describe, expect, it } from "vitest";
import { AUTO_DOOR } from "@/lib/bouwer/autopilot";
import { nieuweMeldingen, type MeldStand } from "@/lib/bouwer/meldingen";
import type { LiveStatus } from "@/lib/bouwer/live";
import type { TaakKort } from "@/lib/bouwer/werker";

const taak = (over: Partial<TaakKort> = {}): TaakKort => ({
  id: "t1",
  opdracht: "Maak de knop op de homepage groter",
  door: "eigenaar@example.com",
  model: "gemini-3.5-flash",
  staat: "bezig",
  begon: "2026-11-03T15:00:00Z",
  bijgewerkt: "2026-11-03T15:05:00Z",
  sha: null,
  bestanden: 0,
  ...over,
});

const live = (over: Partial<LiveStatus> = {}): LiveStatus => ({
  id: "live_1",
  actie: "uitrollen",
  staat: "bezig",
  stap: "bouwen",
  bericht: "",
  door: "eigenaar@example.com",
  begon: "2026-11-03T15:00:00Z",
  bijgewerkt: "2026-11-03T15:05:00Z",
  migraties: [],
  ...over,
});

const stand = (taken: MeldStand["taken"] = {}, l = ""): MeldStand => ({ taken, live: l });

describe("Bouwer-meldingen: wanneer krijgt de eigenaar een push", () => {
  it("meldt de eerste ronde niets, maar legt de stand vast", () => {
    const { meldingen, stand: s } = nieuweMeldingen([taak({ staat: "klaar" })], live({ staat: "klaar" }), null);
    expect(meldingen).toEqual([]);
    expect(s).toEqual({ taken: { t1: "klaar" }, live: "live_1:klaar" });
  });

  it("meldt klaar, vraag, vastgelopen en conflict één keer, met een link naar het tabblad", () => {
    for (const staat of ["klaar", "vraag", "mislukt", "conflict"] as const) {
      const eerst = nieuweMeldingen([taak({ staat })], null, stand({ t1: "bezig" }));
      expect(eerst.meldingen).toHaveLength(1);
      expect(eerst.meldingen[0]?.url).toBe("/admin/zekerflex-ai?tab=bouwer");
      expect(eerst.meldingen[0]?.door).toBe("eigenaar@example.com");
      expect(nieuweMeldingen([taak({ staat })], null, eerst.stand).meldingen).toEqual([]);
    }
  });

  it("meldt een taak die binnen één ronde begon en klaar was", () => {
    expect(nieuweMeldingen([taak({ id: "t2", staat: "klaar" })], null, stand()).meldingen[0]?.titel).toBe("De Bouwer is klaar");
  });

  it("meldt opnieuw na bijsturen (bezig → klaar)", () => {
    const tussen = nieuweMeldingen([taak({ staat: "bezig" })], null, stand({ t1: "klaar" }));
    expect(tussen.meldingen).toEqual([]);
    expect(nieuweMeldingen([taak({ staat: "klaar" })], null, tussen.stand).meldingen).toHaveLength(1);
  });

  it("laat bezig, goedkeuren, gepusht, weggegooid en automatische reparaties stil", () => {
    for (const staat of ["bezig", "goedkeuren", "gepusht", "weggegooid"] as const) {
      expect(nieuweMeldingen([taak({ staat })], null, stand()).meldingen).toEqual([]);
    }
    expect(nieuweMeldingen([taak({ staat: "klaar", door: AUTO_DOOR })], null, stand()).meldingen).toEqual([]);
  });

  it("houdt de vorige stand vast als de Bouwer even onbereikbaar is", () => {
    const weg = nieuweMeldingen(null, null, stand({ t1: "klaar" }, "live_1:klaar"));
    expect(weg.meldingen).toEqual([]);
    expect(weg.stand).toEqual(stand({ t1: "klaar" }, "live_1:klaar"));
    expect(nieuweMeldingen([taak({ staat: "klaar" })], null, weg.stand).meldingen).toEqual([]);
  });

  it("meldt het live zetten bij klaar, mislukt, teruggezet en wachten op akkoord", () => {
    const klaar = nieuweMeldingen([], live({ staat: "klaar", bericht: "Live: feat(x): iets" }), stand({}, "live_1:bezig"));
    expect(klaar.meldingen[0]).toMatchObject({ titel: "Live gezet", tekst: "Live: feat(x): iets", url: "/admin/zekerflex-ai?tab=live" });
    expect(nieuweMeldingen([], live({ staat: "klaar" }), klaar.stand).meldingen).toEqual([]);

    const akkoord = nieuweMeldingen([], live({ staat: "wacht-op-akkoord", migraties: ["a", "b"].map((naam) => ({ naam, destructief: false, sql: "" })) }), stand());
    expect(akkoord.meldingen[0]?.tekst).toBe("Er zijn 2 databasewijzigingen om goed te keuren.");
    expect(nieuweMeldingen([], live({ staat: "teruggezet" }), stand()).meldingen[0]?.titel).toBe("Live zetten teruggedraaid");
    expect(nieuweMeldingen([], live({ staat: "mislukt" }), stand()).meldingen[0]?.titel).toBe("Live zetten mislukt");
    expect(nieuweMeldingen([], live({ staat: "bezig" }), stand()).meldingen).toEqual([]);
    expect(nieuweMeldingen([], live({ actie: "terug", staat: "klaar" }), stand()).meldingen[0]?.titel).toBe("De vorige versie staat weer live");
    // serveronderhoud ziet de eigenaar zelf op het scherm
    expect(nieuweMeldingen([], live({ actie: "onderhoud", staat: "klaar" }), stand()).meldingen).toEqual([]);
  });
});
