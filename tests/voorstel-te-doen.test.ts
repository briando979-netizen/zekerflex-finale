import { describe, expect, it } from "vitest";
import { teDoen } from "@/lib/voorstel/te-doen";

const nul = { teBevestigen: 0, nieuweAanvragen: 0, wachtOpAntwoord: 0, reviewsNieuw: 0, sollicitatiesNieuw: 0, wachtlijstVrij: 0, openTaken: 0, zonderBegeleider: 0, begeleiderDubbel: 0 };

describe("te doen op het dashboard", () => {
  it("is leeg als alles bijgewerkt is", () => {
    expect(teDoen(nul)).toEqual([]);
  });

  it("toont alleen wat er ligt, wachtende gasten eerst, met het juiste tabblad", () => {
    const l = teDoen({ ...nul, teBevestigen: 3, wachtlijstVrij: 1, reviewsNieuw: 2 });
    expect(l.map((p) => p.tab)).toEqual(["wachtlijst", "reserveringen", "reviews"]);
    expect(l[0]?.tekst).toBe("1 wachtende gast kan nu boeken: bel ze");
    expect(l[1]?.tekst).toBe("3 reserveringen nog bevestigen");
    expect(l[2]?.tekst).toBe("2 beoordelingen wachten op goedkeuring");
  });

  it("begeleiders: dubbel vóór zonder, met een filter achter het tabblad", () => {
    const l = teDoen({ ...nul, teBevestigen: 1, zonderBegeleider: 2, begeleiderDubbel: 1 });
    expect(l.map((p) => p.tab)).toEqual(["reserveringen=dubbel", "reserveringen=zonder-begeleider", "reserveringen"]);
    expect(l[0]?.tekst).toBe("1 groep heeft een begeleider die tegelijk elders staat");
    expect(l[1]?.tekst).toBe("2 groepen vandaag of morgen nog zonder begeleider");
  });

  it("gebruikt enkelvoud bij 1", () => {
    expect(teDoen({ ...nul, nieuweAanvragen: 1 })[0]?.tekst).toBe("1 nieuwe aanvraag oppakken");
    expect(teDoen({ ...nul, wachtOpAntwoord: 1 })[0]?.tekst).toBe("1 gast wacht op antwoord op een bericht");
  });
});
