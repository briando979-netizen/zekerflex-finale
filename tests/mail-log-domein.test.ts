import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Een mislukte verzending logt alleen het domein van de ontvanger, nooit het adres (AVG, 13 nov).

const h = vi.hoisted(() => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  smtp: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/env", () => ({
  env: {
    SMTP_HOST: "smtp.mailserver.test",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_TIMEOUT_S: 5,
    MAIL_TLS_VERIFY: false,
    MAIL_FROM: "noreply@zekerflex.test",
    MAIL_FROM_NAME: "ZekerFlex",
    MAIL_REPLY_TO: "info@zekerflex.test",
    APP_BASE_URL: "https://zekerflex.test",
  },
}));
vi.mock("@/lib/mail/smtp", () => ({ sendViaSmtp: h.smtp }));
vi.mock("@/lib/mail/store", () => ({ saveSentMessage: vi.fn(async () => undefined), readSentMessage: vi.fn(async () => null) }));
vi.mock("@/lib/mail/prefs", () => ({ getMailPrefs: vi.fn(), mailAllowed: vi.fn(async () => true) }));

import { sendMail } from "@/lib/mail";
import { ontvangerDomeinen, zonderAdressen } from "@/lib/mail/log-domein";

afterEach(() => vi.clearAllMocks());

describe("ontvangerDomeinen", () => {
  it("geeft het domein in kleine letters", () => {
    expect(ontvangerDomeinen("Jan.Jansen@Voorbeeld.NL")).toBe("voorbeeld.nl");
    expect(ontvangerDomeinen("Piet <piet@zaak.nl>")).toBe("zaak.nl");
  });
  it("geeft unieke domeinen bij meer ontvangers en 'onbekend' zonder @", () => {
    expect(ontvangerDomeinen(["a@b.nl", "c@B.nl", "d@e.nl"])).toBe("b.nl, e.nl");
    expect(ontvangerDomeinen("geen-adres")).toBe("onbekend");
    expect(ontvangerDomeinen(undefined)).toBe("onbekend");
  });
});

describe("zonderAdressen", () => {
  it("haalt adressen uit een SMTP-antwoord", () => {
    expect(zonderAdressen("550 5.1.1 <jan.jansen@voorbeeld.nl> User unknown")).toBe("550 5.1.1 <<e-mail>> User unknown");
    expect(zonderAdressen(undefined)).toBe("");
  });
});

describe("sendMail bij een mislukte verzending", () => {
  it("logt alleen het domein, ook als het SMTP-antwoord het adres noemt", async () => {
    h.smtp.mockRejectedValue(new Error("RCPT TO -> 550 5.1.1 <jan.jansen@voorbeeld.nl> User unknown"));
    const res = await sendMail({ to: "jan.jansen@voorbeeld.nl", subject: "Test", text: "Hoi", kind: "verification" });
    expect(res.delivered).toBe(false);
    const warn = h.log.warn.mock.calls.find((c) => String(c[0]).includes("smtp delivery failed"));
    expect(warn).toBeDefined();
    const meta = JSON.stringify(warn![1]);
    expect(meta).toContain("voorbeeld.nl");
    expect(meta).not.toContain("jan.jansen");
    expect(meta).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(JSON.stringify(h.log.info.mock.calls)).not.toContain("jan.jansen");
  });
});

describe("bewaker: geen adres in een logregel in lib/mail", () => {
  const bestanden = (map: string): string[] =>
    readdirSync(map).flatMap((n) => {
      const p = join(map, n);
      return statSync(p).isDirectory() ? bestanden(p) : /\.tsx?$/.test(n) ? [p] : [];
    });

  it("geen to/from/replyTo/cc/bcc/email als los veld in logger.warn/error/info", () => {
    const fouten: string[] = [];
    for (const f of bestanden(join(process.cwd(), "lib", "mail"))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/logger\.(warn|error|info)\(/g)) {
        const van = m.index ?? 0;
        const einde = src.indexOf(");", van);
        const aanroep = src.slice(van, einde < 0 ? van + 400 : einde);
        const los = /\b(to|from|replyTo|cc|bcc|email|adres)\s*:\s*(?!\s)(?!ontvanger|zonderAdressen|Boolean)/.test(aanroep) || /[{,]\s*(to|from|replyTo|cc|bcc|email)\s*[,}]/.test(aanroep);
        if (los) fouten.push(`${f.slice(process.cwd().length + 1)}: ${aanroep.slice(0, 80).replace(/\s+/g, " ")}`);
      }
    }
    expect(fouten).toEqual([]);
  });
});
