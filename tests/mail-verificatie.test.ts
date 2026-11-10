import { describe, expect, it, vi } from "vitest";

// De mails rond het bevestigen van een e-mailadres: één huisstijl, duidelijke
// code + knop, geldigheidsduur, en niets van de ontvanger ongeëscaped in HTML.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { verificationEmail, welcomeEmail, onboardingReminderEmail } = await import("@/lib/mail");

const AANVAL = `<img src=x onerror=alert(1)> Jan`;

describe("verificationEmail", () => {
  const m = verificationEmail("Sanne de Vries", "https://zekerflex.com/verifieer-email?token=abc", "123456");

  it("heeft code in onderwerp, knop, code en link in HTML en platte tekst", () => {
    expect(m.subject).toContain("123456");
    expect(m.kind).toBe("verification");
    expect(m.text).toContain("123456");
    expect(m.text).toContain("https://zekerflex.com/verifieer-email?token=abc");
    expect(m.html).toContain("E-mailadres bevestigen");
    expect(m.html).toContain("123456");
  });

  it("noemt 24 uur geldigheid en wat te doen als je het niet was", () => {
    expect(m.text).toMatch(/24 uur/);
    expect(m.text).toMatch(/geen account/);
    expect(m.html).toMatch(/24 uur/);
    expect(m.html).toMatch(/geen account/);
  });

  it("heeft een preheader met de code", () => {
    expect(m.html).toMatch(/display:none[^>]*>Je code is 123456/);
  });

  it("escapet een kwaadaardige naam", () => {
    const x = verificationEmail(AANVAL, "https://zekerflex.com/v?token=a", "123456");
    expect(x.html).not.toContain("<img src=x");
    expect(x.html).toContain("&lt;img");
  });

  it("werkt ook zonder code", () => {
    const x = verificationEmail("Sam", "https://zekerflex.com/v?token=a");
    expect(x.subject).not.toContain(":");
    expect(x.html).not.toContain("Liever een code");
  });
});

describe("welcomeEmail en onboardingReminderEmail", () => {
  it("escapen de voornaam", () => {
    expect(welcomeEmail(AANVAL, "freelancer", "https://zekerflex.com").html).not.toContain("<img src=x");
    expect(onboardingReminderEmail(AANVAL, "bedrijf", "https://zekerflex.com", 1).html).not.toContain("<img src=x");
  });

  it("welkomstmail heeft een platte tekst met inloglink en hulpadres", () => {
    const w = welcomeEmail("Sam", "bedrijf", "https://zekerflex.com/", "zzp");
    expect(w.text).toContain("https://zekerflex.com/login");
    expect(w.text).toContain("support@zekerflex.com");
    expect(w.html).toContain("https://zekerflex.com/login");
  });

  it("met de ontwikkelingsnotitie leest een nieuwe gebruiker dat de klussen testklussen zijn, in vijf talen", () => {
    const w = welcomeEmail("Sam", "freelancer", "https://zekerflex.com", "zzp", { ontwikkelingsnotitie: true });
    for (const stuk of ["testklussen", "Begin volgend jaar", "English:", "Polski:", "Română:", "Українською:"]) {
      expect(w.text).toContain(stuk);
    }
    expect(w.html).toContain("testklussen");
    expect(w.html).toContain("Українською");
  });

  it("zonder de notitie (standaard) staat er niets over testklussen in de welkomstmail", () => {
    const w = welcomeEmail("Sam", "freelancer", "https://zekerflex.com", "zzp");
    expect(w.text).not.toContain("testklussen");
    expect(w.html).not.toContain("testklussen");
  });

  it("geen verwijzing naar de Sovereign Box meer in de voettekst", () => {
    expect(welcomeEmail("Sam", "freelancer", "https://zekerflex.com").html).not.toMatch(/Sovereign/);
  });
});
