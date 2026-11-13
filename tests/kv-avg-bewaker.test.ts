import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { ERASABLE_KV_PREFIXES, erasableKvWhere } from "@/lib/privacy/user-kv";

// Bewaker (12 nov 2026, AGENTS.md "AVG"): een nieuwe KV-sleutel per gebruiker hoort met zijn voorvoegsel in
// ERASABLE_KV_PREFIXES (lib/privacy/user-kv.ts), anders ontbreekt hij bij inzage en wissen. Deze test zoekt in lib/, app/
// en components/ (bestanden die de KV gebruiken) naar sleutels als `prefix:${userId}…` en eist dat het voorvoegsel wisbaar
// is, of hieronder staat met een reden. Een nieuw voorvoegsel zonder een van beide faalt. Wissen is niet terug te
// draaien: een voorvoegsel naar de wislijst verplaatsen doet de eigenaar van lib/privacy (86), niet deze test.

const ROOT = process.cwd();

/** Voorvoegsels met een gebruikers-id die bewust niet in de wislijst staan (gemeten 12 nov), met de reden. */
const BASISLIJN: Record<string, string> = {
  "bank-autosave:": "ZekerFlex Bank (staat uit): geldgegevens met bewaartermijn; wissen via lib/privacy/bank-wissen.ts",
  "bank-notes:": "ZekerFlex Bank (staat uit): geldgegevens met bewaartermijn",
  "bank-notify:": "ZekerFlex Bank (staat uit): geldgegevens met bewaartermijn",
  "bank-payout-pref:": "ZekerFlex Bank (staat uit): geldgegevens met bewaartermijn",
  "bank-tax:": "ZekerFlex Bank (staat uit): geldgegevens met bewaartermijn",
  // 86 koos op 12 nov "wisbaar", maar tests/privacy-user-kv.test.ts (3 nov) noemt deze vier uitdrukkelijk een bewaarplicht:
  // eerst dat besluit rechtzetten, dan pas naar ERASABLE_KV_PREFIXES
  "bank-login:": "bewaard volgens tests/privacy-user-kv.test.ts (3 nov); besluit 86 van 12 nov hangt",
  "bank-login-customer:": "hoort bij bank-login: (zelfde besluit)",
  "bank-login-iban:": "hoort bij bank-login: (zelfde besluit)",
  "ref-code-of:": "bewaard volgens tests/privacy-user-kv.test.ts (3 nov); besluit 86 van 12 nov hangt",
  "fiscal:": "bewaarplicht (fiscale gegevens); zie de uitleg in lib/privacy/user-kv.ts",
  "uitzend-contracts:": "bewaarplicht (contracten)",
  "factoring-terms:": "bewaarplicht (geldzaken)",
  "voertuig:": "gewist door wisPersoonUitLocatie (lib/locatie/avg.ts)",
  "btw:": "eenmalige meldingsvlag (claim in lib/worker/milestone-push.ts), geen persoonsgegevens",
  "kor:": "eenmalige meldingsvlag (claim in lib/worker/milestone-push.ts), geen persoonsgegevens",
  "uren:": "eenmalige meldingsvlag (claim in lib/worker/milestone-push.ts), geen persoonsgegevens",
  "spreiding:": "eenmalige meldingsvlag (claim in lib/worker/milestone-push.ts), geen persoonsgegevens",
  "iban-wijziging:rl:2fa:": "limiet, verloopt vanzelf",
  "iban-wijziging:rl:mail:": "limiet, verloopt vanzelf",
  "passkey-toevoegen:rl:mail:": "limiet, verloopt vanzelf",
  "id-overdracht-klaar:": "eenmalig slot (claimIdempotency), verloopt vanzelf; geen KV-rij",
  "id-overdracht-open:": "eenmalig slot (claimIdempotency), verloopt vanzelf; geen KV-rij",
  "kyc-beoordeling:": "sleutel van een melding aan de eigenaar, geen KV-rij",
  "chat-pin:": "invoer van een hash, geen KV-sleutel",
  "burst:": "id van een bankmelding, geen KV-sleutel",
  "fanin:": "id van een bankmelding, geen KV-sleutel",
  "new:": "id van een bankmelding, geen KV-sleutel",
  "offer:seen:": "id van een verkoopkans (getal), geen gebruiker",
  "user:": "actorLabel in het auditspoor, geen KV-sleutel",
  "systeem:": "sleutels van het beheer, geen gegevens over een persoon; systeem:eigen-test is een lijst van tenant- en user-id's met een datum (lib/admin/eigen-test.ts)",
  "kvk-register:v1:": "uitkomst per KVK-nummer (openbaar Handelsregister), geen persoon; 30 dagen cache (lib/integrations/kvkbase.ts)",
};

const GEBRUIKER = /^(?:userId|uid|gebruikerId|accountId|(?:[a-z]+\.)?(?:userId|user\.id)|principal\.userId|p\.userId|u\.id|user\.id|me\.id|ctx\.userId|input\.userId|opts\.userId|args\.userId)$/;
const SLEUTEL = /`([a-z0-9][a-z0-9-]*(?::[a-z0-9-]+)*:)\$\{([^}]+)\}/g;

function bronbestanden(): string[] {
  const uit: string[] = [];
  const loop = (dir: string) => {
    for (const naam of readdirSync(dir)) {
      const p = path.join(dir, naam);
      if (statSync(p).isDirectory()) loop(p);
      else if (/\.(ts|tsx)$/.test(naam)) uit.push(p);
    }
  };
  for (const top of ["lib", "app", "components"]) loop(path.join(ROOT, top));
  return uit;
}

describe("AVG: elke KV-sleutel per gebruiker is wisbaar of staat bewust op de basislijn", () => {
  const wisbaar = new Set<string>(ERASABLE_KV_PREFIXES);

  it("geen nieuw voorvoegsel met een gebruikers-id buiten ERASABLE_KV_PREFIXES", () => {
    const nieuw = new Map<string, Set<string>>();
    let gezien = 0;
    for (const f of bronbestanden()) {
      const tekst = readFileSync(f, "utf8");
      if (!/@\/lib\/storage\/kv|keyValueStore/.test(tekst)) continue;
      for (const m of tekst.matchAll(SLEUTEL)) {
        const voor = m[1] ?? "";
        if (!GEBRUIKER.test((m[2] ?? "").trim())) continue;
        gezien += 1;
        if (wisbaar.has(voor) || Object.hasOwn(BASISLIJN, voor)) continue;
        nieuw.set(voor, (nieuw.get(voor) ?? new Set()).add(path.relative(ROOT, f).replace(/\\/g, "/")));
      }
    }
    expect(gezien, "de bewaker vindt geen sleutels meer: zoekt hij op de goede plek?").toBeGreaterThan(50);
    const melding = [...nieuw].map(([v, fs]) => `${v} (${[...fs].join(", ")})`);
    expect(melding, "zet het voorvoegsel in ERASABLE_KV_PREFIXES (lib/privacy/user-kv.ts, na overleg met 86), of op de basislijn hier met een reden").toEqual([]);
  });

  it("de sleutels van 12 nov (besluit 86) gaan mee bij het wissen, voor precies die gebruiker", () => {
    for (const voor of ["zfmail:user:", "push-profile:"]) {
      const waar = erasableKvWhere("usr_avg_1").OR;
      expect(waar, voor).toContainEqual({ key: { equals: `${voor}usr_avg_1` } });
      expect(waar, voor).toContainEqual({ key: { startsWith: `${voor}usr_avg_1:` } });
      // een andere gebruiker zit er niet in
      expect(JSON.stringify(waar)).not.toContain(`${voor}usr_avg_2`);
    }
  });

  it("de basislijn en de wislijst overlappen niet (een voorvoegsel is wisbaar of bewust niet)", () => {
    expect(Object.keys(BASISLIJN).filter((v) => wisbaar.has(v))).toEqual([]);
  });
});
