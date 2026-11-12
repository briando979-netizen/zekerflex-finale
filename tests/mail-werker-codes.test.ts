import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ibanCodeMailT } from "@/lib/mail/werker/iban-code";
import { mailTijdstip, passkeyCodeMailT, passkeyMeldingMailT, type PasskeyMeldingSoort } from "@/lib/mail/werker/passkey";
import type { MailTaal } from "@/lib/mail/vorm";

// ---------------------------------------------------------------------------
// De veiligheidsmails met een code of melding (passkey, rekeningnummer) in de app-taal van de werker. Nederlands blijft letterlijk
// zoals het was; elke andere taal bevat de code en geen Nederlandse kernzin.
// ---------------------------------------------------------------------------

const TALEN: MailTaal[] = ["nl", "en", "pl", "ro", "uk"];
const ANDERE: MailTaal[] = ["en", "pl", "ro", "uk"];
const SOORTEN: PasskeyMeldingSoort[] = ["toegevoegd", "verwijderd", "herstel", "tweestaps"];
const NL_KERNZINNEN = ["Heb jij dit niet gedaan", "Hoi ", "Was jij dit niet", "bevestigingscode", "Vul deze code in", "Wijzig voor de zekerheid", "Er is een passkey"];
const bron = (pad: string) => readFileSync(pad, "utf8").split("\r\n").join("\n");

const invulling = (wat: PasskeyMeldingSoort) => ({
  wat,
  voornaam: "Sam",
  toestel: "Pixel 8",
  wanneer: mailTijdstip(new Date("2026-11-09T14:04:00Z"), "nl"),
  link: "https://zekerflex.com/dashboard/account/passkeys",
  basis: "https://zekerflex.com",
});

describe("passkey-code", () => {
  it("Nederlands is letterlijk de oude mail", () => {
    const m = passkeyCodeMailT("Sam", "123456", "nl");
    expect(m.subject).toBe("Je bevestigingscode voor een nieuwe passkey");
    expect(m.text).toBe(
      "Hoi Sam,\n\nJe wilt een passkey toevoegen aan je ZekerFlex-account (inloggen met je vingerafdruk, gezicht of pincode). Vul deze code in om dat te bevestigen; hij is 15 minuten geldig:\n\n123456\n\nHeb jij dit niet gedaan? Negeer deze mail: zonder de code komt er geen passkey bij. Wijzig voor de zekerheid je wachtwoord.",
    );
  });

  it.each(TALEN)("%s: onderwerp en tekst gevuld, met de code en de naam", (taal) => {
    const m = passkeyCodeMailT("Sam", "123456", taal);
    expect(m.subject.length).toBeGreaterThan(5);
    expect(m.text).toContain("123456");
    expect(m.text).toContain("Sam");
    expect(m.text).not.toMatch(/\{\w+\}/);
  });

  it.each(ANDERE)("%s: geen Nederlandse kernzin", (taal) => {
    const m = passkeyCodeMailT("Sam", "123456", taal);
    for (const zin of NL_KERNZINNEN) expect(`${m.subject}\n${m.text}`).not.toContain(zin);
  });
});

describe("passkey-meldingen", () => {
  const OUD_NL: Record<PasskeyMeldingSoort, { subject: string; text: string }> = {
    toegevoegd: {
      subject: "Er is een passkey toegevoegd aan je account",
      text: "Hoi Sam,\n\nEr is een passkey toegevoegd aan je ZekerFlex-account: Pixel 8, op 9 november 2026 om 15:04. Met dit toestel kun je nu inloggen met je vingerafdruk, gezicht of pincode.\n\nWas jij dit niet? Verwijder de passkey in je account en wijzig je wachtwoord:\nhttps://zekerflex.com/dashboard/account/passkeys",
    },
    verwijderd: {
      subject: "Er is een passkey verwijderd uit je account",
      text: "Hoi Sam,\n\nEr is een passkey verwijderd uit je ZekerFlex-account: Pixel 8, op 9 november 2026 om 15:04. Met dit toestel log je weer in met je wachtwoord.\n\nWas jij dit niet? Verwijder de passkey in je account en wijzig je wachtwoord:\nhttps://zekerflex.com/dashboard/account/passkeys",
    },
    herstel: {
      subject: "Je passkeys zijn verwijderd na het herstellen van je wachtwoord",
      text: "Hoi Sam,\n\nJe wachtwoord is opnieuw ingesteld op 9 november 2026 om 15:04. Voor je veiligheid hebben we daarom al je passkeys verwijderd (Pixel 8). Je kunt ze opnieuw toevoegen in je account:\nhttps://zekerflex.com/dashboard/account/passkeys\n\nWas jij dit niet? Vraag dan meteen een nieuw wachtwoord aan:\nhttps://zekerflex.com/wachtwoord-vergeten",
    },
    tweestaps: {
      subject: "Tweestapsverificatie staat aan, je passkeys blijven werken",
      text: "Hoi Sam,\n\nTweestapsverificatie is aangezet op 9 november 2026 om 15:04. Je passkeys blijven werken (Pixel 8): een passkey vraagt altijd je vingerafdruk, gezicht of pincode en telt daarom zelf als tweestapsverificatie.\n\nWas jij dit niet? Verwijder de passkey in je account en wijzig je wachtwoord:\nhttps://zekerflex.com/dashboard/account/passkeys",
    },
  };

  it.each(SOORTEN)("nl %s is letterlijk de oude mail", (wat) => {
    expect(passkeyMeldingMailT(invulling(wat), "nl")).toEqual(OUD_NL[wat]);
  });

  it("de tijd staat in Nederlandse tijd, in elke taal ingevuld", () => {
    expect(mailTijdstip(new Date("2026-11-09T14:04:00Z"), "nl")).toBe("9 november 2026 om 15:04");
    expect(mailTijdstip(new Date("2026-11-09T14:04:00Z"), "en")).toBe("November 9, 2026 at 15:04");
  });

  for (const taal of TALEN) {
    it.each(SOORTEN)(`${taal} %s: gevuld, met toestel, tijd en link`, (wat) => {
      const i = { ...invulling(wat), wanneer: mailTijdstip(new Date("2026-11-09T14:04:00Z"), taal) };
      const m = passkeyMeldingMailT(i, taal);
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.text).toContain("Sam");
      expect(m.text).toContain("Pixel 8");
      expect(m.text).toContain(i.wanneer);
      expect(m.text).toContain(i.link);
      expect(m.text).not.toMatch(/\{\w+\}/);
      if (wat === "herstel") expect(m.text).toContain("https://zekerflex.com/wachtwoord-vergeten");
      if (taal !== "nl") {
        for (const zin of NL_KERNZINNEN) expect(`${m.subject}\n${m.text}`).not.toContain(zin);
      }
    });
  }
});

describe("iban-code", () => {
  it("Nederlands is letterlijk de oude mail", () => {
    const m = ibanCodeMailT("Sam", "…4321", "654321", "nl");
    expect(m.subject).toBe("Je bevestigingscode voor een nieuw rekeningnummer");
    expect(m.text).toBe(
      "Hoi Sam,\n\nJe wilt je rekeningnummer voor uitbetalingen wijzigen naar …4321. Vul deze code in om dat te bevestigen; hij is 15 minuten geldig:\n\n654321\n\nHeb jij dit niet gedaan? Verander dan direct je wachtwoord en negeer deze mail: zonder de code verandert er niets aan je uitbetalingen.",
    );
  });

  it.each(TALEN)("%s: gevuld, met code en gemaskeerd rekeningnummer", (taal) => {
    const m = ibanCodeMailT("Sam", "…4321", "654321", taal);
    expect(m.subject.length).toBeGreaterThan(5);
    expect(m.text).toContain("654321");
    expect(m.text).toContain("…4321");
    expect(m.text).toContain("Sam");
    expect(m.text).not.toMatch(/\{\w+\}/);
  });

  it.each(ANDERE)("%s: geen Nederlandse kernzin", (taal) => {
    const m = ibanCodeMailT("Sam", "…4321", "654321", taal);
    for (const zin of NL_KERNZINNEN) expect(`${m.subject}\n${m.text}`).not.toContain(zin);
  });
});

describe("aanroepers", () => {
  it("passkey/mail.ts en iban-bevestiging.ts kiezen de taal via mailTaalVoorWerker", () => {
    const passkey = bron("lib/auth/passkey/mail.ts");
    const iban = bron("lib/fiscal/iban-bevestiging.ts");
    expect(passkey).toContain("mailTaalVoorWerker");
    expect(passkey).toContain("passkeyCodeMailT");
    expect(passkey).toContain("passkeyMeldingMailT");
    expect(iban).toContain("mailTaalVoorWerker");
    expect(iban).toContain("ibanCodeMailT");
  });

  it("de oude Nederlandse zinnen staan niet meer inline in de aanroepers", () => {
    expect(bron("lib/auth/passkey/mail.ts")).not.toContain("Je wilt een passkey toevoegen");
    expect(bron("lib/fiscal/iban-bevestiging.ts")).not.toContain("Je wilt je rekeningnummer");
  });
});
