import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BELONING_EURO,
  INTRO_STATUSSEN,
  beloningTodoId,
  controleerIntroductie,
  eersteIntroductie,
  introStatus,
  normaliseerEmail,
  normaliseerTelefoon,
  telVoorBeloning,
  zonderBeloning,
  type StatusFeiten,
} from "@/lib/introducties/regels";
import { INTRODUCTIE_FEE_REDEN, binnenVrijePeriode, laatsteGratisDag, vrijePeriode } from "@/lib/introducties/periode";
import { aanvulling, dubbelVoorwaarden, introContactVan, introNotitie, koppelNotitie, metIntroContact } from "@/lib/introducties/lead";
import { zakelijkDomein } from "@/lib/sales/vrije-maildomeinen";
import { INTRODUCTIE_NL } from "@/lib/introducties/teksten";
import { INTRODUCTIE_TALEN } from "@/lib/introducties/teksten-talen";
import { buildReverseBillingInvoices } from "@/lib/billing/self-billing";

// "Introduceer een bedrijf" (17 nov 2026, lib/introducties): de pure regels. Invoer, de stand in gewone woorden, de twee
// weken zonder platformkosten (Amsterdamse dag, ook rond de wintertijd), het zoeken naar wat we al kennen en de teksten.

afterEach(() => vi.useRealTimers());

describe("invoer", () => {
  it("e-mailadres: getrimd en klein, anders null", () => {
    expect(normaliseerEmail("  Jan@Bakkerij.NL ")).toBe("jan@bakkerij.nl");
    for (const v of ["", "jan", "jan@", "jan@bakkerij", "jan @bakkerij.nl", "a@b.c", null, undefined]) expect(normaliseerEmail(v), String(v)).toBeNull();
    expect(normaliseerEmail(`${"a".repeat(250)}@b.nl`)).toBeNull();
  });

  it("telefoon: elke gewone schrijfwijze wordt +31…, buitenland blijft buitenland", () => {
    for (const v of ["06 12345678", "06-12345678", "6 12345678", "612345678", "0031 6 1234 5678", "+31 (0)6 12345678", "+31612345678", "+31 6 12 34 56 78"]) {
      expect(normaliseerTelefoon(v), v).toBe("+31612345678");
    }
    expect(normaliseerTelefoon("020 123 4567")).toBe("+31201234567");
    expect(normaliseerTelefoon("+44 7911 123456")).toBe("+447911123456");
    expect(normaliseerTelefoon("0049 30 1234567")).toBe("+49301234567");
    for (const v of ["", "12", "06 1234", "0612345678901", "bel me", "+31 0", null, undefined]) expect(normaliseerTelefoon(v), String(v)).toBeNull();
  });

  it("naam, bedrijf, e-mail of telefoon en het vinkje zijn nodig; wat is ingevuld moet kloppen", () => {
    expect(controleerIntroductie({})).toEqual({ ontbreekt: ["contactNaam", "bedrijf", "contact", "toestemming"], ongeldig: [], schoon: null });
    const goed = { contactNaam: "  Piet  de Vries ", bedrijf: "Bakkerij De Korf", email: "Piet@DeKorf.nl", toestemming: true };
    expect(controleerIntroductie(goed).schoon).toEqual({ contactNaam: "Piet de Vries", bedrijf: "Bakkerij De Korf", email: "piet@dekorf.nl", telefoon: null });
    // alleen een telefoonnummer mag ook
    expect(controleerIntroductie({ ...goed, email: "", telefoon: "06 12345678" }).schoon?.telefoon).toBe("+31612345678");
    // zonder vinkje niet
    expect(controleerIntroductie({ ...goed, toestemming: false }).ontbreekt).toEqual(["toestemming"]);
    // fout adres of nummer: ongeldig, niet "ontbreekt"
    const fout = controleerIntroductie({ ...goed, email: "piet@", telefoon: "12" });
    expect(fout.ongeldig).toEqual(["email", "telefoon"]);
    expect(fout.ontbreekt).toEqual([]);
    expect(fout.schoon).toBeNull();
    // te lang wordt afgekapt, niet geweigerd (de route begrenst de body)
    expect(controleerIntroductie({ ...goed, bedrijf: "B".repeat(500) }).schoon?.bedrijf).toHaveLength(160);
  });
});

describe("de stand in gewone woorden", () => {
  const basis: StatusFeiten = { alKlant: false, lead: { status: "NEW", lastContactedAt: null, suppressed: false }, koppeling: null, beloningVerschuldigd: false, beloningVerstuurd: false };

  it("ingediend → benaderd → klant → beloning onderweg → beloning verstuurd", () => {
    expect(introStatus("i1", basis)).toBe("ingediend");
    expect(introStatus("i1", { ...basis, lead: null })).toBe("ingediend");
    expect(introStatus("i1", { ...basis, lead: { status: "NEW", lastContactedAt: new Date("2026-11-17T10:00:00+01:00"), suppressed: false } })).toBe("benaderd");
    expect(introStatus("i1", { ...basis, lead: { status: "REPLIED", lastContactedAt: null, suppressed: false } })).toBe("benaderd");
    expect(introStatus("i1", { ...basis, koppeling: { introId: "i1" } })).toBe("klant");
    expect(introStatus("i1", { ...basis, koppeling: { introId: "i1" }, beloningVerschuldigd: true })).toBe("beloning-onderweg");
    expect(introStatus("i1", { ...basis, koppeling: { introId: "i1" }, beloningVerschuldigd: true, beloningVerstuurd: true })).toBe("beloning-verstuurd");
  });

  it("al klant, een ander was eerder, en een lead die afviel", () => {
    expect(introStatus("i1", { ...basis, alKlant: true, koppeling: { introId: "i1" } })).toBe("al-klant");
    expect(introStatus("i2", { ...basis, koppeling: { introId: "i1" }, beloningVerschuldigd: true })).toBe("eerder");
    for (const status of ["LOST", "DISQUALIFIED", "UNSUBSCRIBED", "BOUNCED"]) expect(introStatus("i1", { ...basis, lead: { status, lastContactedAt: null, suppressed: false } }), status).toBe("gestopt");
    expect(introStatus("i1", { ...basis, lead: { status: "NEW", lastContactedAt: null, suppressed: true } })).toBe("gestopt");
  });

  it("in de app is er geen beloning: onderweg en verstuurd worden 'klant geworden'", () => {
    expect(zonderBeloning("beloning-onderweg")).toBe("klant");
    expect(zonderBeloning("beloning-verstuurd")).toBe("klant");
    for (const s of INTRO_STATUSSEN.filter((x) => !x.startsWith("beloning"))) expect(zonderBeloning(s)).toBe(s);
  });

  it("de beloning gaat naar de eerste introductie; bij gelijke tijd het kleinste id", () => {
    expect(eersteIntroductie([])).toBeNull();
    const lijst = [
      { id: "b", at: "2026-11-17T10:00:00.000Z" },
      { id: "c", at: "2026-11-16T09:00:00.000Z" },
      { id: "a", at: "2026-11-16T09:00:00.000Z" },
    ];
    expect(eersteIntroductie(lijst)?.id).toBe("a");
  });

  it("alleen een betaalde factuur voor platformkosten met een bedrag telt; de taak-id past in Te doen", () => {
    expect(telVoorBeloning({ type: "PLATFORM_FEE", totalCents: 4235 })).toBe(true);
    expect(telVoorBeloning({ type: "PLATFORM_FEE", totalCents: 0 })).toBe(false);
    for (const type of ["SELF_BILL_FREELANCER", "UITZEND_FEE", "DOMEIN", ""]) expect(telVoorBeloning({ type, totalCents: 4235 }), type).toBe(false);
    expect(telVoorBeloning({ type: "PLATFORM_FEE", totalCents: Number.NaN })).toBe(false);
    expect(beloningTodoId("abcdefghij")).toBe("intro-bol:abcdefghij");
    expect(beloningTodoId("abcdefghij").length).toBeLessThanOrEqual(40);
  });
});

describe("twee weken zonder platformkosten (Amsterdamse dag)", () => {
  it("koppelen 17 nov: 17 t/m 30 nov gratis, 1 dec weer betaald", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T09:30:00+01:00"));
    const p = vrijePeriode(new Date());
    expect(p).toEqual({ gratisVanaf: "2026-11-17", gratisTot: "2026-12-01" });
    expect(laatsteGratisDag(p)).toBe("2026-11-30");
    expect(binnenVrijePeriode(p, new Date("2026-11-17T00:30:00+01:00"))).toBe(true);
    expect(binnenVrijePeriode(p, new Date("2026-11-30T23:30:00+01:00"))).toBe(true);
    expect(binnenVrijePeriode(p, new Date("2026-12-01T00:10:00+01:00"))).toBe(false);
    // de dag vóór het koppelen blijft betaald
    expect(binnenVrijePeriode(p, new Date("2026-11-16T23:59:00+01:00"))).toBe(false);
  });

  it("rekent met de Amsterdamse dag, niet met UTC", () => {
    // 23:30 UTC op 16 nov is al 17 nov in Amsterdam
    expect(vrijePeriode(new Date("2026-11-16T23:30:00Z")).gratisVanaf).toBe("2026-11-17");
    const p = { gratisVanaf: "2026-11-17", gratisTot: "2026-12-01" };
    // een dienst om 00:30 in Amsterdam op 1 dec is in UTC nog 30 nov: toch betaald
    expect(binnenVrijePeriode(p, new Date("2026-11-30T23:30:00Z"))).toBe(false);
    expect(binnenVrijePeriode(p, new Date("2026-11-16T23:30:00Z"))).toBe(true);
  });

  it("over de wintertijd heen (25 okt) blijven het veertien kalenderdagen", () => {
    const p = vrijePeriode(new Date("2026-10-20T15:00:00+02:00"));
    expect(p).toEqual({ gratisVanaf: "2026-10-20", gratisTot: "2026-11-03" });
    expect(binnenVrijePeriode(p, new Date("2026-11-02T22:00:00+01:00"))).toBe(true);
    expect(binnenVrijePeriode(p, new Date("2026-11-03T08:00:00+01:00"))).toBe(false);
  });

  it("een kapotte of ontbrekende periode geeft nooit korting", () => {
    const d = new Date("2026-11-20T10:00:00+01:00");
    for (const p of [null, undefined, {}, { gratisVanaf: "2026-11-17" }, { gratisVanaf: "17-11-2026", gratisTot: "2026-12-01" }, { gratisVanaf: 1, gratisTot: 2 }]) {
      expect(binnenVrijePeriode(p as never, d), JSON.stringify(p)).toBe(false);
    }
    expect(binnenVrijePeriode({ gratisVanaf: "2026-11-17", gratisTot: "2026-12-01" }, new Date("kapot"))).toBe(false);
  });

  it("de factuurregel noemt de reden, het totaal is € 0; zonder reden blijft de regel zoals hij was", () => {
    const basis = {
      timesheetId: "ts1",
      billableMinutes: 480,
      hourlyRateCents: 3000,
      freelancerId: "fl1",
      freelancerCountry: "NL",
      freelancerVatValid: true,
      recipientTenantId: "t1",
      recipientCountry: "NL",
      platformTenantId: "p1",
      shiftTitle: "Shift @ Hal 1",
      workedOn: new Date("2026-11-20T08:00:00+01:00"),
      freelancerInvoiceNumber: "ZF-SB-1",
      platformInvoiceNumber: "ZF-PF-1",
      volumeTierName: "Basis",
    };
    const vrij = buildReverseBillingInvoices({ ...basis, platformFeePerHourCents: 0, platformFeeReden: INTRODUCTIE_FEE_REDEN });
    expect(vrij.platformFeeInvoice.totalCents).toBe(0);
    expect(vrij.platformFeeInvoice.lines[0]?.description).toBe("ZekerFlex platformkosten (€ 0,00 per gewerkt uur, introductie: eerste twee weken zonder platformkosten) — Shift @ Hal 1");
    // de werker merkt er niets van
    expect(vrij.freelancerPayoutCents).toBe(buildReverseBillingInvoices(basis).freelancerPayoutCents);
    // kosteloos bedrijf (zonder reden): de oude regel
    expect(buildReverseBillingInvoices({ ...basis, platformFeePerHourCents: 0 }).platformFeeInvoice.lines[0]?.description).toBe("ZekerFlex platformkosten (€ 0,00 per gewerkt uur, staffel Basis) — Shift @ Hal 1");
    expect(buildReverseBillingInvoices(basis).platformFeeInvoice.lines[0]?.description).toBe("ZekerFlex platformkosten (€ 3,50 per gewerkt uur) — Shift @ Hal 1");
  });
});

describe("wat we al kennen", () => {
  it("een zakelijk domein telt, een gratis maildienst niet", () => {
    expect(zakelijkDomein("piet@DeKorf.nl")).toBe("dekorf.nl");
    for (const e of ["piet@gmail.com", "piet@hotmail.nl", "piet@ziggo.nl", "piet", "piet@localhost"]) expect(zakelijkDomein(e), e).toBeNull();
  });

  it("de voorwaarden: adres en domein voor leads en beheerders, het nummer alleen voor leads", () => {
    const zakelijk = dubbelVoorwaarden("piet@dekorf.nl", "+31612345678");
    expect(zakelijk.domein).toBe("dekorf.nl");
    expect(zakelijk.lead).toEqual([
      { contactEmail: { equals: "piet@dekorf.nl", mode: "insensitive" } },
      { discoveredEmail: { equals: "piet@dekorf.nl", mode: "insensitive" } },
      { contactEmail: { endsWith: "@dekorf.nl", mode: "insensitive" } },
      { discoveredEmail: { endsWith: "@dekorf.nl", mode: "insensitive" } },
      { contactPhone: "+31612345678" },
    ]);
    expect(zakelijk.gebruiker).toEqual([{ email: { equals: "piet@dekorf.nl", mode: "insensitive" } }, { email: { endsWith: "@dekorf.nl", mode: "insensitive" } }]);

    const gmail = dubbelVoorwaarden("piet@gmail.com", null);
    expect(gmail.domein).toBeNull();
    expect(JSON.stringify(gmail)).not.toContain("endsWith");

    const alleenNummer = dubbelVoorwaarden(null, "+31612345678");
    expect(alleenNummer.lead).toEqual([{ contactPhone: "+31612345678" }]);
    expect(alleenNummer.gebruiker).toEqual([]);
  });

  it("een bestaande lead krijgt alleen lege velden aangevuld", () => {
    expect(aanvulling({ contactName: null, contactEmail: "info@dekorf.nl", contactPhone: "  " }, { contactNaam: "Piet", email: "piet@dekorf.nl", telefoon: "+31612345678" })).toEqual({ contactName: "Piet", contactPhone: "+31612345678" });
    expect(aanvulling({ contactName: "Jan", contactEmail: "a@b.nl", contactPhone: "+31201234567" }, { contactNaam: "Piet", email: null, telefoon: null })).toEqual({});
  });

  it("het contact van een introductie staat bij de lead: bijgevoegd, nooit dubbel, hooguit twintig", () => {
    const c = (introId: string, email: string | null = `${introId}@dekorf.nl`) => ({ introId, at: "2026-11-17T08:00:00.000Z", contactNaam: "Piet", email, telefoon: null });
    const een = metIntroContact({ sbiCodes: ["1071"] }, c("i1"));
    expect(een).toEqual({ sbiCodes: ["1071"], introductieContacten: [c("i1")] });
    // dezelfde introductie nog eens: vervangen, niet erbij
    expect(metIntroContact(een, c("i1", "nieuw@dekorf.nl"))).toEqual({ sbiCodes: ["1071"], introductieContacten: [c("i1", "nieuw@dekorf.nl")] });
    let veel: unknown = null;
    for (let i = 0; i < 25; i++) veel = metIntroContact(veel, c(`i${i}`));
    expect((veel as { introductieContacten: unknown[] }).introductieContacten).toHaveLength(20);
    // rommel in de verrijking breekt niets
    expect(metIntroContact({ introductieContacten: "kapot" }, c("i1"))).toEqual({ introductieContacten: [c("i1")] });
    expect(metIntroContact([1, 2], c("i1"))).toEqual({ introductieContacten: [c("i1")] });

    const lead = { contactEmail: "info@dekorf.nl", contactPhone: "+31201234567", enrichmentJson: een };
    expect(introContactVan(lead, "i1")).toEqual({ email: "i1@dekorf.nl", telefoon: null });
    // een lead die de introductie zelf maakte: de velden van de lead
    expect(introContactVan(lead, "i9")).toEqual({ email: "info@dekorf.nl", telefoon: "+31201234567" });
    expect(introContactVan(null, "i1")).toEqual({ email: null, telefoon: null });
  });

  it("de notitie bij de lead noemt geen naam van wie het voorstelde, wel dat niets vanzelf gaat", () => {
    const n = introNotitie("werker", new Date("2026-11-17T09:05:00+01:00"));
    expect(n.startsWith("[17-11 09:05] Introductie via een werker")).toBe(true);
    expect(n).toContain("niets wordt vanzelf gemaild");
    expect(introNotitie("werkgever", new Date("2026-11-17T09:05:00+01:00"))).toContain("via een werkgever");
    expect(koppelNotitie("Bakkerij De Korf B.V.", "2026-11-30", new Date("2026-11-17T09:05:00+01:00"))).toBe("[17-11 09:05] Gekoppeld aan bedrijf Bakkerij De Korf B.V.: geen platformkosten tot en met 2026-11-30.");
  });
});

describe("teksten", () => {
  const sleutels = (o: unknown, pad = ""): string[] =>
    o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => sleutels(v, pad ? `${pad}.${k}` : k)) : [pad];

  it("de vijf talen hebben dezelfde sleutels, niets leeg, en dezelfde plaatshouders", () => {
    const nl = sleutels(INTRODUCTIE_NL).sort();
    expect(INTRODUCTIE_TALEN.nl).toBe(INTRODUCTIE_NL);
    for (const [taal, t] of Object.entries(INTRODUCTIE_TALEN)) {
      expect(sleutels(t).sort(), taal).toEqual(nl);
      for (const pad of nl) {
        const waarde = pad.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], t);
        const bron = pad.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], INTRODUCTIE_NL);
        expect(typeof waarde === "string" && waarde.trim().length > 0, `${taal}.${pad}`).toBe(true);
        const ph = (s: unknown) => (String(s).match(/\{\w+\}/g) ?? []).sort();
        expect(ph(waarde), `${taal}.${pad}`).toEqual(ph(bron));
      }
    }
  });

  it("elke stand heeft een tekst en een uitleg; alleen de beloningsregels noemen de beloning", () => {
    for (const s of INTRO_STATUSSEN) {
      expect(INTRODUCTIE_NL.status[s], s).toBeTruthy();
      expect(INTRODUCTIE_NL.statusUitleg[s], s).toBeTruthy();
    }
    // wat ook in de app staat (lib/app-mode.ts), zegt in geen enkele taal iets over geld of tegoed
    for (const [taal, t] of Object.entries(INTRODUCTIE_TALEN)) {
      const inApp = [t.menu, t.kaartSub, t.titel, t.uitleg, t.regelGratis, t.regelGegevens, t.regelMens, ...INTRO_STATUSSEN.filter((s) => !s.startsWith("beloning")).flatMap((s) => [t.status[s], t.statusUitleg[s]])];
      for (const zin of inApp) expect(zin, `${taal}: ${zin}`).not.toMatch(/tegoed|beloning|€|bol\.com|bol-|voucher|bon |nagrod|recompens|винагород|ваучер/i);
    }
    expect(INTRODUCTIE_NL.regelBeloning).toContain("€ {bedrag} bol-tegoed");
    expect(BELONING_EURO).toBe(50);
  });
});
