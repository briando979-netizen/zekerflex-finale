import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  freelancerProfile: { findUnique: vi.fn() },
  shift: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({ fixedWindow: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/mail", async (orig) => ({ ...(await orig<typeof import("@/lib/mail")>()), sendMail: vi.fn(async () => ({ ok: true })) }));

const { mailKlusVoorstel, klusMoment, klusTarief, MAIL_PER_UREN } = await import("@/lib/notifications/klus-mail");
const { sendMail } = await import("@/lib/mail");
const { fixedWindow } = await import("@/lib/rate-limit");

const werker = { user: { email: "jan@devries.test", fullName: "Jan de Vries", emailVerifiedAt: new Date("2026-11-01T10:00:00+01:00"), disabledAt: null } };
const klus = {
  title: "Bediening <b>terras</b>",
  startsAt: new Date("2026-11-10T09:00:00+01:00"),
  endsAt: new Date("2026-11-10T17:00:00+01:00"),
  hourlyRateCents: 1650,
  status: "OPEN",
  branch: { name: "Café De Hoek", city: "Utrecht", tenant: { name: "Café De Hoek BV" } },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T12:00:00+01:00"));
  vi.clearAllMocks();
  db.freelancerProfile.findUnique.mockResolvedValue(werker);
  db.shift.findUnique.mockResolvedValue(klus);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("klusvoorstel per mail", () => {
  it("mailt de klus met een link naar de klus, als klus-alert (afmelden kan)", async () => {
    expect(await mailKlusVoorstel({ freelancerId: "fp1", shiftId: "s1", travelMinutes: 25 })).toBe("verstuurd");
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendMail).mock.calls[0]?.[0];
    expect(mail?.to).toBe("jan@devries.test");
    expect(mail?.kind).toBe("klus-alert");
    expect(mail?.text).toContain("/dashboard/klussen/s1");
    expect(mail?.text).toContain("dinsdag 10 november, 09:00–17:00");
    expect(mail?.text).toContain("€ 16,50 per uur, ongeveer 25 minuten reizen");
  });

  it("zet tekst van de opdrachtgever nooit als HTML in de mail", async () => {
    await mailKlusVoorstel({ freelancerId: "fp1", shiftId: "s1", travelMinutes: null });
    const html = vi.mocked(sendMail).mock.calls[0]?.[0]?.html ?? "";
    expect(html).toContain("Bediening &lt;b&gt;terras&lt;/b&gt;");
    expect(html).not.toContain("<b>terras</b>");
  });

  it("nooit voor een testklus", async () => {
    db.shift.findUnique.mockResolvedValue({ ...klus, branch: { ...klus.branch, tenant: { name: "Test bedrijven" } } });
    expect(await mailKlusVoorstel({ freelancerId: "fp1", shiftId: "s1", travelMinutes: 10 })).toBe("testklus");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("alleen naar een bevestigd adres van een actief account", async () => {
    db.freelancerProfile.findUnique.mockResolvedValue({ user: { ...werker.user, emailVerifiedAt: null } });
    expect(await mailKlusVoorstel({ freelancerId: "fp1", shiftId: "s1", travelMinutes: 10 })).toBe("geen-adres");
    db.freelancerProfile.findUnique.mockResolvedValue({ user: { ...werker.user, disabledAt: new Date("2026-11-05T10:00:00+01:00") } });
    expect(await mailKlusVoorstel({ freelancerId: "fp1", shiftId: "s1", travelMinutes: 10 })).toBe("geen-adres");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("niet voor een klus die dicht is of al begonnen", async () => {
    db.shift.findUnique.mockResolvedValue({ ...klus, status: "FILLED" });
    expect(await mailKlusVoorstel({ freelancerId: "fp1", shiftId: "s1", travelMinutes: 10 })).toBe("geen-klus");
    db.shift.findUnique.mockResolvedValue({ ...klus, startsAt: new Date("2026-11-09T11:00:00+01:00") });
    expect(await mailKlusVoorstel({ freelancerId: "fp1", shiftId: "s1", travelMinutes: 10 })).toBe("geen-klus");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("hoogstens één mail per werker per paar uur, en geen mail als de rem niet te lezen is", async () => {
    vi.mocked(fixedWindow).mockResolvedValueOnce({ ok: false } as Awaited<ReturnType<typeof fixedWindow>>);
    expect(await mailKlusVoorstel({ freelancerId: "fp1", shiftId: "s1", travelMinutes: 10 })).toBe("begrensd");
    expect(sendMail).not.toHaveBeenCalled();
    expect(fixedWindow).toHaveBeenCalledWith("klus-mail:fp1", 1, MAIL_PER_UREN * 3600, { failOpen: false });
  });
});

describe("opmaak", () => {
  it("dag en tijden in Nederlandse tijd, ook in de winter op een UTC-server", () => {
    expect(klusMoment(new Date("2026-11-10T08:00:00Z"), new Date("2026-11-10T16:00:00Z"))).toBe("dinsdag 10 november, 09:00–17:00");
  });
  it("tarief met komma", () => {
    expect(klusTarief(1650)).toBe("€ 16,50");
    expect(klusTarief(2000)).toBe("€ 20,00");
  });
});
