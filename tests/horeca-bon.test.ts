import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { bonMail, bonPdf } = await import("@/lib/horeca/bon");

const kop = { naam: "Brasserie <script>alert(1)</script>", adres: "Markt 1", plaats: "Groningen", telefoon: "050 123 45 67", kvk: "12345678", btwNummer: "NL001234567B01", voettekst: "Bedankt!" };
const bon = {
  id: "clz9k2abc0001xyz",
  bonNummer: 42,
  op: "2026-11-07T18:30:00.000Z",
  tafel: "Tafel 4",
  methode: "ideal",
  bedragCent: 2690,
  fooiCent: 310,
  regels: [
    { naam: "Burger", prijsCent: 1795, aantal: 1, btw: 9 },
    { naam: "Pils", prijsCent: 395, aantal: 2, btw: 21 },
    { naam: "Koffie", prijsCent: 105, aantal: 1, btw: 9 },
  ],
  door: "Gast aan tafel (iDEAL)",
  token: "dG9rZW4.handtekening",
};

describe("horeca-bon", () => {
  it("maakt een geldige pdf met de bon", () => {
    const pdf = bonPdf(kop, bon);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const tekst = pdf.toString("latin1");
    expect(tekst).toContain("Bon 42");
    expect(tekst).toContain("1 x Burger");
    expect(tekst).toContain("26,90");
  });

  it("mailt de bon met de pdf erbij, zonder html van buiten", () => {
    const zaak = { kleur: "#0A120E", email: "info@brasserie.test" } as Parameters<typeof bonMail>[0];
    const m = bonMail(zaak, kop, bon, bon.token, "gast@voorbeeld.test");
    expect(m.to).toBe("gast@voorbeeld.test");
    expect(m.replyTo).toBe("info@brasserie.test");
    expect(m.attachments?.[0]?.contentType).toBe("application/pdf");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain(`/bon/${bon.token}`);
  });

  it("valt terug op een veilige kleur als de zaak iets vreemds als kleur heeft", () => {
    const zaak = { kleur: "red;background:url(x)", email: "" } as Parameters<typeof bonMail>[0];
    const m = bonMail(zaak, kop, bon, bon.token, "gast@voorbeeld.test");
    expect(m.html).not.toContain("url(x)");
    expect(m.replyTo).toBeUndefined();
  });
});
