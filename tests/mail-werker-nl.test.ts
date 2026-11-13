import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// De mails aan werkers (lib/mail/werker/*) staan nu in vijf talen. In het Nederlands moeten ze BYTE VOOR BYTE gelijk blijven aan de mails zoals
// ze waren vóór de vertaling (12 nov 2026): dezelfde onderwerpen, teksten en html. De hashes zijn berekend met de oude opbouw in lib/mail/index.ts.

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { verificationEmailT } from "@/lib/mail/werker/verificatie";
import { passwordResetEmailT } from "@/lib/mail/werker/wachtwoord";
import { accountDeletionEmailT } from "@/lib/mail/werker/account-wissen";
import { welcomeEmailT } from "@/lib/mail/werker/welkom";
import { idGeverifieerdEmailT } from "@/lib/mail/werker/id-geverifieerd";
import { aanmeldingCompleetEmailT } from "@/lib/mail/werker/aanmelding-compleet";
import { klusVoorstelEmailT } from "@/lib/mail/werker/klusvoorstel";

const sha = (m: unknown) => createHash("sha256").update(JSON.stringify(m)).digest("hex");
// 13 nov: de knop en de regel "Inloggen:" in de welkomstmail gaan naar het eigen startscherm (/dashboard, /werkgever) in plaats
// van /login. Zet je dat ene adres terug, dan moet de mail weer byte voor byte de oude zijn: zo blijft de rest bewaakt.
const shaMetOudeLink = (m: unknown, pad: string) =>
  createHash("sha256").update(JSON.stringify(m).replaceAll(`${u}${pad}`, `${u}/login`)).digest("hex");
const u = "https://zf.test";
const klus = { fullName: "Anna Kowalska", title: "Barista", branch: "Café Noord", city: "Groningen", when: "maandag 10 november, 09:00–17:00", rate: "€ 16,50", link: `${u}/dashboard/klussen/s1` };

const GOLDEN: Record<string, string> = {
  verificatie_code: "c60f75f4e0796713ace2b56af2db9a3bdde61f7835db1cad9bdb0d339863de1e",
  verificatie_zonder: "b87105e688e21cb679fd159727d223cd10134a75ee1a523f2c5840784e150a9c",
  welkom_zzp: "107f45f9ac5ec6000d5308bd155417b471d71b8525a99fd5be8062ba2e67cde3",
  welkom_uitzend: "6d956978135508eaaba492e5c699a0c0dc086a793d20aa7a4b1d3b68f857e08e",
  welkom_bedrijf: "92fd90c33c40d92702a2f2308b00cc056f788c8a06636e006b83f58bb0408c6c",
  id_ja: "db76768f535c2e2d707c9872923fbfdce3417a1737d148a739d26eb05ff771f8",
  id_nee: "87d276a61b037fb8fe87751d8a3b149d11df04947472edfce65895b81b610e68",
};

describe("Nederlands is byte voor byte gelijk aan vóór de vertaling", () => {
  it("verificatie-mail, met en zonder code", () => {
    expect(sha(verificationEmailT("Anna Kowalska", `${u}/verifieer-email?token=abc`, "123456", "nl"))).toBe(GOLDEN.verificatie_code);
    expect(sha(verificationEmailT("Anna Kowalska", `${u}/verifieer-email?token=abc`, undefined, "nl"))).toBe(GOLDEN.verificatie_zonder);
  });
  it("welkomstmail (zzp, uitzendkracht met ontwikkelingsnotitie, bedrijf)", () => {
    const zzp = welcomeEmailT("Anna Kowalska", "freelancer", u, "zzp", {}, "nl");
    const uitzend = welcomeEmailT("Anna Kowalska", "freelancer", u, "uitzendkracht", { ontwikkelingsnotitie: true }, "nl");
    const bedrijf = welcomeEmailT("Jan Bakker", "bedrijf", u, undefined, {}, "nl");
    expect(shaMetOudeLink(zzp, "/dashboard")).toBe(GOLDEN.welkom_zzp);
    expect(shaMetOudeLink(uitzend, "/dashboard")).toBe(GOLDEN.welkom_uitzend);
    expect(shaMetOudeLink(bedrijf, "/werkgever")).toBe(GOLDEN.welkom_bedrijf);
    // het nieuwe adres staat er in de tekst en in de knop, /login niet meer
    for (const [m, pad] of [[zzp, "/dashboard"], [uitzend, "/dashboard"], [bedrijf, "/werkgever"]] as const) {
      expect(m.text).toContain(`Inloggen: ${u}${pad}\n`);
      expect(m.html).toContain(`href="${u}${pad}"`);
      expect(JSON.stringify(m)).not.toContain(`${u}/login`);
    }
  });
  it("ID geverifieerd", () => {
    expect(sha(idGeverifieerdEmailT("Anna Kowalska", u, true, "nl"))).toBe(GOLDEN.id_ja);
    expect(sha(idGeverifieerdEmailT("Anna Kowalska", u, false, "nl"))).toBe(GOLDEN.id_nee);
  });
  it("aanmelding compleet, klusvoorstel, wachtwoord en account wissen", () => {
    const g = GOLDEN_2;
    expect(sha(aanmeldingCompleetEmailT({ fullName: "Anna Kowalska", appUrl: u, soort: "kan-reageren" }, "nl"))).toBe(g.aanm_kan);
    expect(sha(aanmeldingCompleetEmailT({ fullName: "Anna Kowalska", appUrl: u, soort: "nog-iets", reden: "Vul je rekeningnummer (IBAN) in." }, "nl"))).toBe(g.aanm_nog);
    expect(sha(aanmeldingCompleetEmailT({ fullName: "Anna Kowalska", appUrl: u, soort: "id-in-controle" }, "nl"))).toBe(g.aanm_id);
    expect(sha(klusVoorstelEmailT({ ...klus, travelMinutes: 25 }, "nl"))).toBe(g.klus);
    expect(sha(klusVoorstelEmailT({ ...klus, travelMinutes: null }, "nl"))).toBe(g.klus_zonder_reis);
    expect(sha(passwordResetEmailT("Anna Kowalska", `${u}/reset?token=x`, "nl"))).toBe(g.wachtwoord);
    expect(sha(accountDeletionEmailT("Anna Kowalska", `${u}/verwijder?token=x`, "nl"))).toBe(g.verwijderen);
  });
});

const GOLDEN_2: Record<string, string> = {
  aanm_kan: "68c1480ecc189d873f7fd6117d433125f6f3848765229d0bc1c9731bfa68f7be",
  aanm_nog: "35a40da8dd49a9143a17364f739e0cf6b4dd753062dc31be1c2377b3d3e97939",
  aanm_id: "e1cb7c77a3609aff4dd301dd26c077e352f6bef636d70b590dfd563e97ba4f27",
  klus: "397c41d5fe6740f488d397c0bc1edf549c353f3830f72573de3e01ce839a60c7",
  klus_zonder_reis: "9ad712186906d7516ff70fbe556be65ebbfc9bca21a6e80f0044e1fb52713fb9",
  wachtwoord: "c2aafe7285c319628566dfab5b9d492c72820fdc8609b5f142498ce8f089ef27",
  verwijderen: "5ee3cd000ef7e86790e95841aa4e41c7bf0675676052e793e290628e168ff225",
};
