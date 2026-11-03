import { describe, expect, it } from "vitest";
import { aanmeldFout, balieStand } from "@/lib/voorstel/aanwezig-regels";

describe("aanmelden bij de balie", () => {
  const vandaag = "2026-11-03";

  it("kan vandaag en achteraf, niet vooruit en niet na annuleren", () => {
    expect(aanmeldFout({ datum: vandaag, status: "bevestigd" }, vandaag)).toBeNull();
    expect(aanmeldFout({ datum: "2026-11-01", status: "nieuw" }, vandaag)).toBeNull();
    expect(aanmeldFout({ datum: "2026-11-04", status: "bevestigd" }, vandaag)).toMatch(/vanaf de dag zelf/);
    expect(aanmeldFout({ datum: vandaag, status: "geannuleerd" }, vandaag)).toMatch(/geannuleerde/);
  });

  it("telt gasten binnen, niet gekomen en open; geannuleerd telt niet mee", () => {
    expect(
      balieStand([
        { personen: 4, status: "bevestigd", aanwezig: "ja" },
        { personen: 6, status: "bevestigd", aanwezig: "nee" },
        { personen: 2, status: "nieuw" },
        { personen: 8, status: "geannuleerd", aanwezig: "ja" },
      ]),
    ).toEqual({ verwacht: 12, binnen: 4, nietGekomen: 1, open: 1 });
    expect(balieStand([])).toEqual({ verwacht: 0, binnen: 0, nietGekomen: 0, open: 0 });
  });
});
