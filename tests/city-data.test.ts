import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ redis: {}, cached: async () => null }));

import { type CityCompany, rankCompanies } from "@/lib/admin/city-data";
import { COMPANY_SLOTS } from "@/lib/admin/city-layout";

// Wie krijgt welk pand in de 3D-stad: de drukste klant het dichtst bij het
// hoofdkantoor, en nooit meer klanten dan er kavels zijn.

const c = (id: string, over: Partial<CityCompany> = {}): CityCompany => ({ id, name: id, branches: 0, openShifts: 0, shiftsWeek: 0, workingNow: 0, ...over });

describe("rangorde van klantpanden", () => {
  it("zet wie nu mensen aan het werk heeft vooraan, dan open diensten, dan deze week", () => {
    const ranked = rankCompanies([c("rustig"), c("week", { shiftsWeek: 9 }), c("open", { openShifts: 2 }), c("werkt", { workingNow: 1 })]);
    expect(ranked.map((x) => x.id)).toEqual(["werkt", "open", "week", "rustig"]);
  });

  it("sorteert gelijke klanten op naam, zodat panden niet heen en weer springen", () => {
    expect(rankCompanies([c("Zeeland"), c("Amstel"), c("Markt")]).map((x) => x.id)).toEqual(["Amstel", "Markt", "Zeeland"]);
  });

  it("geeft nooit meer klanten een pand dan er kavels zijn", () => {
    const many = Array.from({ length: 30 }, (_, i) => c(`k${String(i).padStart(2, "0")}`, { branches: i }));
    const ranked = rankCompanies(many);
    expect(ranked).toHaveLength(COMPANY_SLOTS.length);
    expect(ranked[0]?.id).toBe("k29");
  });
});
