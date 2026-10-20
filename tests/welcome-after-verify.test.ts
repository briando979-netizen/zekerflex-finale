import { beforeEach, describe, expect, it, vi } from "vitest";

// The welcome mail goes out once the e-mail address is confirmed with the
// code/link — not together with the code mail at sign-up.

const m = vi.hoisted(() => ({
  user: { id: "u1", email: "jan@test.nl", fullName: "Jan Kowalski", emailVerifiedAt: null as Date | null, memberships: [{ role: "FREELANCER" }] },
  mail: vi.fn(async (_x: { subject: string; to: string }) => ({ delivered: true, transport: "mailbox" })),
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ workerKind: "zzp" }) }));
vi.mock("@/lib/mail/store", () => ({
  mintToken: async () => ({ token: "tok", code: "123456" }),
  consumeCode: async (_u: string, c: string) => (c === "123456" ? "u1" : null),
  consumeToken: async (t: string) => (t === "tok" ? "u1" : null),
  latestVerification: async () => null,
}));
vi.mock("@/lib/mail", async (orig) => ({ ...(await orig<typeof import("@/lib/mail")>()), sendMail: m.mail }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () => ({ ...m.user }),
      updateMany: async () => {
        if (m.user.emailVerifiedAt) return { count: 0 };
        m.user.emailVerifiedAt = new Date();
        return { count: 1 };
      },
    },
  },
}));

import { confirmVerificationCode, confirmVerificationToken, sendVerificationEmail } from "@/lib/auth/email-verify";

describe("welcome mail after e-mail verification", () => {
  beforeEach(() => {
    m.user.emailVerifiedAt = null;
    m.mail.mockClear();
  });

  it("the code mail alone is not a welcome mail", async () => {
    await sendVerificationEmail("u1", "jan@test.nl", "Jan Kowalski");
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.mail.mock.calls[0]![0].subject).not.toMatch(/Welkom/);
  });

  it("a wrong code sends nothing", async () => {
    expect((await confirmVerificationCode("u1", "000000")).ok).toBe(false);
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("the right code sends the welcome mail — once, even if the link is clicked too", async () => {
    expect((await confirmVerificationCode("u1", "123 456")).ok).toBe(true);
    expect((await confirmVerificationToken("tok")).ok).toBe(true);
    const welcome = m.mail.mock.calls.filter((c) => /Welkom/.test(c[0].subject));
    expect(welcome).toHaveLength(1);
    expect(welcome[0]![0].to).toBe("jan@test.nl");
  });
});
