import { describe, expect, it } from "vitest";
import { leesVerzamelingKop } from "@/lib/kennisbank/verzameling";

describe("leesVerzamelingKop", () => {
  it("leest naam en omschrijving; zonder Toegang-regel is de verzameling voor iedereen leesbaar", () => {
    expect(leesVerzamelingKop("# Handleiding flexwerkers\nAlles wat je moet weten.\n", "x")).toEqual({
      naam: "Handleiding flexwerkers",
      uitleg: "Alles wat je moet weten.",
      intern: false,
    });
  });

  it("'Toegang: intern' maakt de verzameling privé en verdwijnt uit de omschrijving", () => {
    const kop = leesVerzamelingKop("# Intern: werkprocessen\nVoor het eigen team.\n\nToegang: intern\n", "x");
    expect(kop).toEqual({ naam: "Intern: werkprocessen", uitleg: "Voor het eigen team.", intern: true });
    // hoofdletters en spaties maken niet uit; een andere waarde is niet intern
    expect(leesVerzamelingKop("# A\nTOEGANG:  Intern", "x").intern).toBe(true);
    expect(leesVerzamelingKop("# A\nToegang: iedereen", "x")).toEqual({ naam: "A", uitleg: "", intern: false });
  });

  it("valt terug op de mapnaam als de eerste regel geen titel is", () => {
    expect(leesVerzamelingKop("", "opdrachtgevers").naam).toBe("opdrachtgevers");
    expect(leesVerzamelingKop("#   \nuitleg", "opdrachtgevers")).toEqual({ naam: "opdrachtgevers", uitleg: "uitleg", intern: false });
  });
});
