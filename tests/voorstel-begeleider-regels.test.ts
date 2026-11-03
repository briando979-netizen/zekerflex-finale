import { describe, expect, it } from "vitest";
import { begeleiderTellingen, dubbelIngepland, perBegeleider, type Groep } from "@/lib/voorstel/begeleider-regels";

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

  it("telt voor Te doen: zonder begeleider (vandaag en morgen) en dubbel ingepland (komend)", () => {
    const lijst = [
      g("A", "14:00", "Sanne", { datum: "2026-11-04" }),
      g("B", "14:30", "Sanne", { datum: "2026-11-04" }),
      g("C", "10:00", undefined, { datum: "2026-11-04" }),
      g("D", "10:00", undefined, { datum: "2026-11-05" }),
      g("E", "10:00", undefined, { datum: "2026-11-06" }), // overmorgen telt niet
      g("F", "10:00", undefined, { datum: "2026-11-04", status: "geannuleerd" }),
      g("G", "10:00", undefined, { datum: "2026-11-03" }), // voorbij telt niet
      g("H", "14:00", "Piet", { datum: "2026-11-03" }),
      g("I", "14:30", "Piet", { datum: "2026-11-03" }), // dubbel, maar voorbij
    ];
    expect(begeleiderTellingen(lijst, duur, "2026-11-04")).toEqual({ zonderBegeleider: 2, begeleiderDubbel: 2 });
  });

  it("telt 'zonder begeleider' niet als het team geen begeleiders gebruikt", () => {
    expect(begeleiderTellingen([g("A", "10:00", undefined), g("B", "11:00", " ")], duur, "2026-11-04")).toEqual({ zonderBegeleider: 0, begeleiderDubbel: 0 });
  });

  it("groepeert per begeleider, op naam en op tijd", () => {
    const lijst = perBegeleider([g("A", "16:00", "Sanne"), g("B", "11:00", "Piet"), g("C", "11:00", "Sanne"), g("D", "12:00", "")]);
    expect(lijst.map((r) => [r.naam, r.groepen.map((b) => b.id)])).toEqual([
      ["Piet", ["B"]],
      ["Sanne", ["C", "A"]],
    ]);
  });
});
