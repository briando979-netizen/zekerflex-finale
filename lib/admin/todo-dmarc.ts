// Eigenaar-taken voor DMARC (14 nov 2026). Op 7 nov weigerde Microsoft 12 nieuwsbriefmails ("lacks SPF/DKIM/DMARC Auth
// Records"): zekerflex.com had toen geen DMARC-record. Dat staat er sinds 13 nov, maar op "alleen kijken" (p=none) en
// zonder rapportadres. Deze taak geeft de stappen in gewoon Nederlands en vinkt zichzelf per stap af op de DNS:
// rapportadres (rua) aanwezig = stap 2 en 3 klaar; p=quarantine of p=reject = helemaal klaar. Puur: de DNS komt van
// owner-todos.ts (leesDmarcRecord krijgt het TXT-antwoord zoals node:dns het geeft).

import type { OwnerTodo } from "@/lib/admin/owner-todos";

export interface DmarcStand {
  /** het beleid: none, quarantine of reject */
  p: string;
  /** de rapportadressen (rua), zonder "mailto:" */
  rua: string[];
}

/** Een TXT-antwoord van _dmarc.<domein> → beleid en rapportadressen; null als er geen DMARC-record staat. */
export function leesDmarcRecord(records: string[][]): DmarcStand | null {
  const r = records.map((x) => x.join("")).find((x) => /^v=DMARC1/i.test(x.trim()));
  if (!r) return null;
  const p = /(?:^|;)\s*p\s*=\s*([a-z]+)/i.exec(r)?.[1]?.toLowerCase() ?? "none";
  const rua = (/(?:^|;)\s*rua\s*=\s*([^;]+)/i.exec(r)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^mailto:/i, "").replace(/!.*$/, ""))
    .filter((s) => s.includes("@"));
  return { p, rua };
}

const isStreng = (p: string) => p === "quarantine" || p === "reject";
const klaar = (ja: boolean, tekst: string) => (ja ? `✓ ${tekst}` : tekst);

/** De stappen voor zekerflex.com. `undefined` = de DNS was niet te lezen (dan geen taak, om niets vals te tonen). */
export function dmarcStappenTodo(stand: DmarcStand | null | undefined): OwnerTodo | null {
  if (stand === undefined) return null;
  const streng = Boolean(stand && isStreng(stand.p));
  const rapporten = Boolean(stand && stand.rua.length > 0);
  const title = streng
    ? `DMARC staat streng (p=${stand?.p})`
    : rapporten
      ? "DMARC: na twee schone weken op p=quarantine zetten"
      : stand
        ? "DMARC-rapporten aanzetten en daarna strenger zetten"
        : "DMARC aanzetten voor zekerflex.com";
  return {
    id: "dmarc-stappen",
    group: "Beheer & veiligheid",
    title,
    why: "Op 7 november weigerde Microsoft 12 nieuwsbriefmails, omdat zekerflex.com toen geen DMARC-record had. Dat record staat er sinds 13 november, maar op 'alleen kijken' (p=none) en zonder rapportadres: we zien dus niet hoe Microsoft en Google onze mail beoordelen. Met de stappen hieronder zie je dat wel, en daarna maak je het strenger zodat niemand zich als ZekerFlex kan voordoen.",
    how: [
      "Stap 1. Stuur een testmail: Beheer → Mail → knop 'Testmail', naar je eigen Hotmail- of Outlook-adres en naar een Gmail-adres. Komt hij in Postvak IN en niet bij Ongewenst? Open de mail in Gmail, kies ⋮ → 'Origineel weergeven': SPF, DKIM en DMARC moeten alle drie PASS zijn.",
      klaar(rapporten, "Stap 2. Maak bij TransIP (E-mail, zekerflex.com) het adres dmarc@zekerflex.com, dat doorstuurt naar info@zekerflex.com."),
      klaar(rapporten, "Stap 3. Zet de rapporten aan: TransIP → Domeinen → zekerflex.com → DNS. Kies bij de regel _dmarc (soort TXT) 'Wijzigen' en zet als waarde: v=DMARC1; p=none; rua=mailto:dmarc@zekerflex.com. Microsoft en Google sturen dan elke dag een overzicht naar dat adres."),
      klaar(streng, "Stap 4. Na twee weken zonder afwijzingen in die overzichten: verander in dezelfde regel p=none in p=quarantine. Mail die zich ten onrechte als ZekerFlex voordoet, gaat dan naar de spam. Deze taak vinkt zichzelf af zodra dat in de DNS staat."),
    ],
    auto: true,
    done: streng,
    ...(streng
      ? { doneNote: `DMARC staat op p=${stand?.p}${rapporten ? `; rapporten gaan naar ${stand?.rua.join(", ")}` : ""}` }
      : rapporten
        ? { doneNote: `stap 2 en 3 klaar: rapporten gaan naar ${stand?.rua.join(", ")}; nog op p=${stand?.p}` }
        : {}),
  };
}

/** zekerflex.nl: daar staat DMARC streng maar zonder DKIM. `undefined` = niet te lezen (dan geen taak). */
export function dmarcNlTodo(nl: DmarcStand | null | undefined, dkim: boolean | undefined): OwnerTodo | null {
  if (nl === undefined || dkim === undefined) return null;
  // zonder streng beleid en zonder DKIM is er niets dat nu misgaat; met DKIM is het in orde
  if (!dkim && !(nl && isStreng(nl.p))) return null;
  return {
    id: "dmarc-zekerflex-nl",
    group: "Beheer & veiligheid",
    title: dkim ? "zekerflex.nl: DKIM staat aan" : "zekerflex.nl: DKIM aanzetten (of nooit mailen vanaf @zekerflex.nl)",
    why: `Op zekerflex.nl staat DMARC streng (p=${nl?.p ?? "?"}), maar zonder DKIM-handtekening. Een mail met een @zekerflex.nl-adres als afzender gaat dan naar de spam of wordt geweigerd. ZekerFlex zelf mailt nu alleen vanaf @zekerflex.com.`,
    how: [
      "Zet bij TransIP DKIM aan voor zekerflex.nl (E-mail, zekerflex.nl, instellingen). TransIP zet dan zelf de regels transip-a._domainkey en transip-b._domainkey in de DNS, zoals bij zekerflex.com.",
      "Wil je dat niet: verstuur dan nooit mail met een @zekerflex.nl-adres als afzender, ook niet vanuit je eigen mailprogramma.",
      "Deze taak vinkt zichzelf af zodra de DKIM-regels van zekerflex.nl in de DNS staan.",
    ],
    auto: true,
    done: dkim,
    ...(dkim ? { doneNote: "DKIM staat voor zekerflex.nl" } : {}),
  };
}
