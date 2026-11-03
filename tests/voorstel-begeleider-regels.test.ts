import { describe, expect, it } from "vitest";
import { dubbelIngepland, perBegeleider, type Groep } from "@/lib/voorstel/begeleider-regels";

const g = (id: string, tijd: string, begeleider: string | undefined, extra: Partial<Groep> = {}): Groep => ({
  id,
  datum: "2026-11-04",
  tijd,
  activiteit: "buggy",
  status: "bevestigd",
  ...(begeleider !== undefined ? { begeleider } : {}),
  ...extra,
});
const duur = { buggy: 90, segway: 60 };

describe("begeleider dubbel ingepland", () => {
  it("ziet overlap op dezelfde dag, ook bij andere schrijfwijze van de naam", () => {
    const uit = dubbelIngepland([g("A", "14:00", "Sanne"), g("B", "15:00", " sanne "), g("C", "15:30", "Sanne")], duur);
    expect(uit.get("2026-11-04-A")?.map((b) => b.id)).toEqual(["B"]);
    expect(uit.get("2026-11-04-B")?.map((b) => b.id)).toEqual(["A", "C"]);
    expect(uit.get("2026-11-04-C")?.map((b) => b.id)).toEqual(["B"]);
  });

  it("aansluitend is geen overlap; geannuleerd, andere dag of andere begeleider telt niet", () => {
    const uit = dubbelIngepland(
      [
        g("A", "14:00", "Sanne"),
        g("B", "15:30", "Sanne"),
        g("C", "14:00", "Sanne", { status: "geannuleerd" }),
        g("D", "14:00", "Sanne", { datum: "2026-11-05" }),
        g("E", "14:00", "Piet"),
        g("F", "14:00", undefined),
      ],
      duur,
    );
    expect(uit.size).toBe(0);
  });

  it("gebruikt de duur van de activiteit (onbekend = 60 minuten)", () => {
    expect(dubbelIngepland([g("A", "14:00", "Sanne", { activiteit: "segway" }), g("B", "15:00", "Sanne")], duur).size).toBe(0);
    expect(dubbelIngepland([g("A", "14:00", "Sanne", { activiteit: "onbekend" }), g("B", "14:59", "Sanne")], duur).size).toBe(2);
  });

  it("groepeert per begeleider, op naam en op tijd", () => {
    const lijst = perBegeleider([g("A", "16:00", "Sanne"), g("B", "11:00", "Piet"), g("C", "11:00", "Sanne"), g("D", "12:00", "")]);
    expect(lijst.map((r) => [r.naam, r.groepen.map((b) => b.id)])).toEqual([
      ["Piet", ["B"]],
      ["Sanne", ["C", "A"]],
    ]);
  });
});
