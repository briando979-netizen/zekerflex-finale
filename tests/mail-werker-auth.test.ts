import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Bevestigings-, wachtwoordherstel- en account-wissen-mail aan een werker: in alle vijf talen compleet, met de link (en code), en veilig geëscaped.

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { verificationEmailT } from "@/lib/mail/werker/verificatie";
import { passwordResetEmailT } from "@/lib/mail/werker/wachtwoord";
import { accountDeletionEmailT } from "@/lib/mail/werker/account-wissen";
import type { MailTaal } from "@/lib/mail/vorm";

const TALEN: MailTaal[] = ["nl", "en", "pl", "ro", "uk"];
const link = "https://zf.test/actie?token=abc";
const code = "123456";

const mails = {
  verificatie: (taal: MailTaal, naam = "Anna Kowalska") => verificationEmailT(naam, link, code, taal),
  wachtwoord: (taal: MailTaal, naam = "Anna Kowalska") => passwordResetEmailT(naam, link, taal),
  wissen: (taal: MailTaal, naam = "Anna Kowalska") => accountDeletionEmailT(naam, link, taal),
};

// Een kenmerkende Nederlandse zin per mail: in een andere taal mag hij niet meer voorkomen.
const NL_ZIN = {
  verificatie: "Bevestig je e-mailadres",
  wachtwoord: "opnieuw in te stellen",
  wissen: "wettelijke bewaarplicht",
};

describe("mails aan werkers: verificatie, wachtwoord, account wissen", () => {
  for (const [soort, maak] of Object.entries(mails) as [keyof typeof mails, (t: MailTaal, n?: string) => ReturnType<typeof verificationEmailT>][]) {
    for (const taal of TALEN) {
      it(`${soort} in ${taal}`, () => {
        const m = maak(taal);
        expect(m.subject.length).toBeGreaterThan(5);
        expect(m.text.length).toBeGreaterThan(50);
        expect(m.text).toContain(link);
        expect(m.html).toContain(link);
        expect(m.html).toContain(`<html lang="${taal}">`);
        if (soort === "verificatie") {
          expect(m.subject).toContain(code);
          expect(m.text).toContain(code);
          expect(m.html).toContain(code);
        }
        if (taal !== "nl") {
          expect(m.text).not.toContain(NL_ZIN[soort]);
          expect(m.html).not.toContain(NL_ZIN[soort]);
          expect(m.subject).not.toBe(maak("nl").subject);
        }
      });
    }
  }

  it("zonder code blijft de verificatiemail compleet", () => {
    for (const taal of TALEN) {
      const m = verificationEmailT("Anna Kowalska", link, undefined, taal);
      expect(m.subject).not.toContain(":");
      expect(m.html).not.toContain("letter-spacing:6px");
    }
  });

  it("html-tekens in de naam worden geëscaped", () => {
    for (const taal of TALEN) {
      for (const maak of Object.values(mails)) {
        const m = maak(taal, "<script>alert(1)</script>");
        expect(m.html).not.toContain("<script>alert(1)");
        expect(m.html).toContain("&lt;script&gt;");
      }
    }
  });

  it("de aanroepers kiezen de taal met mailTaalVoorWerker", () => {
    const lees = (p: string) => readFileSync(p, "utf8").split("\r\n").join("\n");
    const gevallen: [string, string][] = [
      ["lib/auth/email-verify.ts", "verificationEmailT("],
      ["lib/auth/password-reset.ts", "passwordResetEmailT("],
      ["lib/privacy/deletion-request.ts", "accountDeletionEmailT("],
    ];
    for (const [pad, aanroep] of gevallen) {
      const bron = lees(pad);
      expect(bron).toContain("mailTaalVoorWerker(");
      expect(bron).toContain(aanroep);
    }
  });
});
