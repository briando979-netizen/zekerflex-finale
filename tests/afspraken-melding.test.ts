import { beforeEach, describe, expect, it, vi } from "vitest";

// Alles is gemockt: er gaat in deze test nooit een echte push of mail weg.
const m = vi.hoisted(() => ({
  leden: [] as { user: { id: string; email: string } }[],
  zoek: vi.fn(),
  push: vi.fn(),
  mail: vi.fn(),
  waarschuw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { membership: { findMany: (...a: unknown[]) => m.zoek(...a) } } }));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://app.zekerflex.test/" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => m.waarschuw(...a), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => m.push(...a) }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => m.mail(...a) }));

import { meldBedrijf, meldingTekst } from "@/lib/afspraken/melding";
import type { Afspraak } from "@/lib/afspraken/model";

const afspraak: Afspraak = {
  id: "2026-11-12~abcdef1234",
  dienstId: "d1",
  dienstNaam: "Knippen",
  duurMin: 30,
  prijsCent: 2500,
  medewerkerId: "w1",
  medewerkerNaam: "Jan",
  start: "2026-11-12T08:30:00.000Z", // 09:30 in Nederland
  eind: "2026-11-12T09:00:00.000Z",
  klant: { naam: "Piet Jansen", telefoon: "06 1234 5678", email: "piet@voorbeeld.test" },
  opmerking: "Graag een korte baard",
  status: "bevestigd",
  bron: "online",
  gemaaktOp: "2026-11-12T06:00:00.000Z",
};

beforeEach(() => {
  m.leden = [{ user: { id: "u1", email: "beheerder@bedrijf.test" } }];
  m.zoek.mockReset().mockImplementation(async () => m.leden);
  m.push.mockReset().mockResolvedValue(1);
  m.mail.mockReset().mockResolvedValue({ delivered: true });
  m.waarschuw.mockReset();
});

describe("meldingTekst", () => {
  it("is gewoon Nederlands, in Nederlandse tijd, en de mail heeft de contactgegevens en een link naar de agenda", () => {
    const t = meldingTekst("geboekt", afspraak, "https://app.zekerflex.test/");
    expect(t.titel).toBe("Nieuwe afspraak");
    expect(t.push).toBe("Piet Jansen: Knippen, do 12 nov 09:30 bij Jan.");
    expect(t.mail).toContain("Een klant heeft online een afspraak gemaakt.");
    expect(t.mail).toContain("Contact: 06 1234 5678 · piet@voorbeeld.test");
    expect(t.mail).toContain("Opmerking: Graag een korte baard");
    expect(t.mail).toContain("Bekijk de agenda: https://app.zekerflex.test/werkgever/afspraken");
    expect(t.mail).not.toContain("//werkgever");
  });

  it("een annulering krijgt een eigen titel en zin (dezelfde functie, voor later)", () => {
    const t = meldingTekst("geannuleerd", afspraak, "https://x.test");
    expect(t.titel).toBe("Afspraak geannuleerd");
    expect(t.mail).toContain("geannuleerd");
  });

  it("laat lege delen weg: geen contact, geen opmerking, geen medewerker", () => {
    const t = meldingTekst("geboekt", { ...afspraak, klant: { naam: "Els", telefoon: "", email: "" }, opmerking: "", medewerkerNaam: "" }, "https://x.test");
    expect(t.mail).not.toMatch(/Contact:|Opmerking:/);
    expect(t.push).toBe("Els: Knippen, do 12 nov 09:30.");
  });
});

describe("meldBedrijf", () => {
  it("stuurt een push naar de beheerders van de organisatie (en zoekt alleen HQ_ADMIN's van die organisatie, niet geblokkeerd)", async () => {
    await meldBedrijf("t1", afspraak, "geboekt");
    expect(m.zoek).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", role: "HQ_ADMIN", user: { disabledAt: null } } }));
    expect(m.push).toHaveBeenCalledTimes(1);
    expect(m.push).toHaveBeenCalledWith(["u1"], expect.objectContaining({ title: "Nieuwe afspraak", data: expect.objectContaining({ url: "/werkgever/afspraken" }) }));
    expect(m.mail).not.toHaveBeenCalled(); // de push kwam aan: geen mail erbovenop
  });

  it("geen apparaat bereikt: dan een mail aan die beheerder", async () => {
    m.push.mockResolvedValue(0);
    await meldBedrijf("t1", afspraak, "geboekt");
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ to: "beheerder@bedrijf.test", subject: "Nieuwe afspraak: Knippen, do 12 nov 09:30", kind: "generic" }));
  });

  it("per beheerder apart: de een heeft push, de ander krijgt een mail", async () => {
    m.leden = [{ user: { id: "u1", email: "een@bedrijf.test" } }, { user: { id: "u2", email: "twee@bedrijf.test" } }];
    m.push.mockImplementation(async (ids: string[]) => (ids[0] === "u1" ? 2 : 0));
    await meldBedrijf("t1", afspraak, "geannuleerd");
    expect(m.push).toHaveBeenCalledTimes(2);
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ to: "twee@bedrijf.test" }));
  });

  it("een beheerder zonder e-mailadres en zonder push geeft geen fout", async () => {
    m.leden = [{ user: { id: "u1", email: "" } }];
    m.push.mockResolvedValue(0);
    await expect(meldBedrijf("t1", afspraak, "geboekt")).resolves.toBeUndefined();
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("geen beheerders: niets te doen", async () => {
    m.leden = [];
    await meldBedrijf("t1", afspraak, "geboekt");
    expect(m.push).not.toHaveBeenCalled();
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("gooit nooit: een mislukte push, mail of zoekopdracht laat alleen een waarschuwing achter, en de volgende beheerder krijgt hem nog", async () => {
    m.leden = [{ user: { id: "u1", email: "een@bedrijf.test" } }, { user: { id: "u2", email: "twee@bedrijf.test" } }];
    m.push.mockRejectedValueOnce(new Error("push stuk")).mockResolvedValueOnce(0);
    m.mail.mockRejectedValue(new Error("smtp stuk voor piet@voorbeeld.test"));
    await expect(meldBedrijf("t1", afspraak, "geboekt")).resolves.toBeUndefined();
    expect(m.push).toHaveBeenCalledTimes(2);
    expect(m.mail).toHaveBeenCalledTimes(1);
    m.zoek.mockRejectedValue(new Error("database weg"));
    await expect(meldBedrijf("t1", afspraak, "geboekt")).resolves.toBeUndefined();
    expect(m.waarschuw).toHaveBeenCalled();
  });

  it("zet geen persoonsgegevens in het log", async () => {
    m.push.mockRejectedValue(new Error("fout met piet@voorbeeld.test en 06 1234 5678"));
    await meldBedrijf("t1", afspraak, "geboekt");
    m.zoek.mockRejectedValue(new Error("Piet Jansen"));
    await meldBedrijf("t1", afspraak, "geboekt");
    const log = JSON.stringify(m.waarschuw.mock.calls);
    expect(m.waarschuw).toHaveBeenCalledTimes(2);
    expect(log).not.toMatch(/Piet|voorbeeld|1234|@/);
  });
});
