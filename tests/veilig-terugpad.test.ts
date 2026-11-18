import { describe, expect, it } from "vitest";
import { veiligTerugpad } from "@/lib/http/veilig-terugpad";

describe("veiligTerugpad", () => {
  it("laat een gewoon eigen pad door", () => {
    expect(veiligTerugpad("/register?type=freelancer")).toBe("/register?type=freelancer");
    expect(veiligTerugpad("/dashboard/klussen")).toBe("/dashboard/klussen");
  });

  it("valt terug op de standaard bij leeg of ontbrekend", () => {
    expect(veiligTerugpad(null)).toBe("/");
    expect(veiligTerugpad(undefined)).toBe("/");
    expect(veiligTerugpad("")).toBe("/");
    expect(veiligTerugpad("", "/voorbeeld")).toBe("/voorbeeld");
  });

  it("blokkeert een open redirect naar een vreemde host", () => {
    expect(veiligTerugpad("https://evil.example")).toBe("/");
    expect(veiligTerugpad("http://evil.example/pad")).toBe("/");
    expect(veiligTerugpad("//evil.example")).toBe("/");
    expect(veiligTerugpad("/\\evil.example")).toBe("/");
    expect(veiligTerugpad("/pad\\naar")).toBe("/");
    expect(veiligTerugpad("javascript:alert(1)")).toBe("/");
    expect(veiligTerugpad("mail.example")).toBe("/");
  });
});
