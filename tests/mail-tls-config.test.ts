import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/mail/store", () => ({ saveSentMessage: vi.fn() }));
vi.mock("@/lib/mail/prefs", () => ({ getMailPrefs: vi.fn(), mailAllowed: vi.fn() }));

import { imapConfig, smtpConfig } from "@/lib/mail";

function setEnv(over: Record<string, unknown>) {
  Object.assign(env, {
    APP_BASE_URL: "https://www.zekerflex.com",
    SMTP_PORT: 465,
    SMTP_SECURE: true,
    SMTP_USER: "info@zekerflex.com",
    SMTP_PASS: "secret",
    SMTP_TIMEOUT_S: 20,
    IMAP_PORT: 993,
    IMAP_SECURE: true,
    MAIL_TLS_VERIFY: true,
    ...over,
  });
}

afterEach(() => {
  for (const k of Object.keys(env)) delete env[k];
});

describe("platform mail TLS verification", () => {
  it("checks the certificate of a real mail server, for SMTP and IMAP alike", () => {
    setEnv({ SMTP_HOST: "smtp.transip.email" });
    expect(smtpConfig()).toMatchObject({ host: "smtp.transip.email", verifyTls: true });
    expect(imapConfig()).toMatchObject({ host: "imap.transip.email", verifyTls: true });
  });

  it("skips the check for a local catcher like Mailpit", () => {
    setEnv({ SMTP_HOST: "localhost", SMTP_PORT: 1025, SMTP_SECURE: false });
    expect(smtpConfig()!.verifyTls).toBe(false);
    setEnv({ SMTP_HOST: "127.0.0.1" });
    expect(smtpConfig()!.verifyTls).toBe(false);
  });

  it("can be switched off for a relay with a self-signed certificate", () => {
    setEnv({ SMTP_HOST: "relay.intern.example", MAIL_TLS_VERIFY: false });
    expect(smtpConfig()!.verifyTls).toBe(false);
    expect(imapConfig()!.verifyTls).toBe(false);
  });
});
