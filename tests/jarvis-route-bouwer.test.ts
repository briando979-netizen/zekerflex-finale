import { describe, expect, it } from "vitest";
import { heuristicRoute } from "@/lib/jarvis/core";

// ZekerFlex AI mag alleen op een expliciete opdracht code laten bouwen of uitrollen.

describe("heuristicRoute: Bouwer en live zetten", () => {
  it("stuurt een expliciete opdracht naar de Bouwer", () => {
    for (const p of ["bouw: zet een FAQ op de prijzenpagina", "Bouwer: maak de knop groter", "bouwer, voeg een filter toe", "laat de bouwer de footer aanpassen"]) {
      expect(heuristicRoute(p)?.capability, p).toBe("bouwer");
    }
  });

  it("zet live op een expliciete opdracht", () => {
    for (const p of ["zet live", "Zet de nieuwste versie live", "zet alles live", "rol uit", "rol de nieuwste versie uit"]) {
      expect(heuristicRoute(p)?.capability, p).toBe("live");
    }
  });

  it("een gewone vraag start nooit de Bouwer of een uitrol", () => {
    for (const p of [
      "hoe bouw ik een team op",
      "wat bouwt de bouwer eigenlijk",
      "bouw",
      "bouw:",
      "staat de nieuwe versie live?",
      "hoeveel klussen staan er live",
      "wanneer zetten we de webshop live",
    ]) {
      const c = heuristicRoute(p)?.capability;
      expect(c === "bouwer" || c === "live", p).toBe(false);
    }
  });
});
