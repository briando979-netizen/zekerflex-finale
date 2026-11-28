/**
 * Dutch KvK (Kamer van Koophandel) Registration Checklist
 *
 * Foreign companies operating in the Netherlands must register with the Dutch Chamber of Commerce
 * within a certain timeframe. For Zekerflex, Inc. (US Delaware company), registration is required
 * to operate legally and is typically done within 2 weeks of starting operations or by an agreed deadline.
 *
 * Target deadline for Zekerflex: 17 December 2026
 */

export interface KvKChecklistItem {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "done";
  dueDate?: string;
  doneOn?: string;
  notes?: string;
  criticalPath?: boolean; // Items that must be done before others
}

export interface KvKStatus {
  deadline: string; // "2026-12-17"
  daysUntilDeadline: number;
  items: KvKChecklistItem[];
  overallStatus: "not-started" | "on-track" | "at-risk" | "overdue" | "complete";
  estimatedCost: string;
}

/**
 * Steps required for KvK registration of a foreign (US) company in the Netherlands.
 *
 * This is typically handled through:
 * 1. KvK online portal (kvk.nl) - most common and fastest
 * 2. KvK office in person - if more complex
 * 3. Through a Dutch accountant or intermediary
 */
export function kvkChecklist(today: Date): KvKStatus {
  const deadline = new Date("2026-12-17T23:59:59Z");
  const daysRemaining = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const items: KvKChecklistItem[] = [
    {
      id: "docs-gathered",
      title: "Documenten verzameld",
      description: "Zet alle vereiste documenten klaar in het Nederlands of Engels (door KvK geaccepteerd).",
      status: "pending",
      criticalPath: true,
      dueDate: "2026-12-04",
      notes:
        "Vereist: (1) Origineel/geverifieerde kopie van Delaware Certificate of Incorporation, (2) Bewijs van eigen adres in NL (huurcontract/factuur), (3) Paspoort eigenaar, (4) Opgave van bevoegd persoon (ondertekenaar)",
    },
    {
      id: "docs-translate",
      title: "Delaware-stukken vertaald of geverifieerd",
      description: "Laat de Certificate of Incorporation door een geautoriseerde vertaler naar het Nederlands vertalen, of geef aan dat het Engels door KvK is geaccepteerd.",
      status: "pending",
      criticalPath: true,
      dueDate: "2026-12-05",
      notes: "Advies: Laat de vertaling door KvK checken voordat je inzending doet (contact kvk.nl)",
    },
    {
      id: "address-secured",
      title: "Vestigingsadres in Nederland",
      description: "Je hebt een adres nodig voor bedrijfsactiviteiten in Nederland (kan je privéadres zijn, maar beter is een kantoor/coworking).",
      status: "pending",
      criticalPath: true,
      dueDate: "2026-12-04",
      notes: "Heb je: huurcontract of eigendomsakte + recente rekeningafschrift op dat adres (niet ouder dan 3 maanden)",
    },
    {
      id: "kvk-registration-form",
      title: "KvK-aanmeldingsformulier invuld",
      description: "Vul op kvk.nl het inschrijvingsformulier voor buitenlandse ondernemingen in.",
      status: "pending",
      criticalPath: true,
      dueDate: "2026-12-10",
      notes: "Formulier: 'Registratie buitenlandse onderneming' op kvk.nl → Inschrijven → Voor het eerst inschrijven",
    },
    {
      id: "kvk-submit",
      title: "KvK-inschrijving ingediend",
      description: "Dien het formulier en documenten in via kvk.nl (online) of breng naar een KvK-loket.",
      status: "pending",
      criticalPath: true,
      dueDate: "2026-12-15",
      notes: "Online: 24 uur; per post: ±5-7 werkdagen; in persoon: direct. Betaling ±€ 50-70",
    },
    {
      id: "kvk-confirmation",
      title: "KvK-nummer ontvangen",
      description: "Na goedkeuring ontvang je een KvK-nummer (8 cijfers) en een inschrijfbewijs.",
      status: "pending",
      dueDate: "2026-12-17",
      ...(false && { doneOn: undefined }),
      doneOn: undefined,
      notes: "Dit is je Nederlands bedrijfsregistratienummer. Bewaar het inschrijfbewijs.",
    },
    {
      id: "kvk-files",
      title: "Administratie (KvK-bewijs, nummering)",
      description: "Sla het KvK-inschrijfbewijs en het nummer op in je bedrijfsadministratie.",
      status: "pending",
      dueDate: "2026-12-17",
      notes: "Je hebt dit nodig voor bankrekening, belastingaangifte (btw) en Wtta-inschrijving",
    },
    {
      id: "tax-registration-vat",
      title: "BTW-registratie (volgt uit KvK)",
      description: "Met je KvK-inschrijving kun je je automatisch voor btw registreren, of je accountant doet dit.",
      status: "pending",
      dueDate: "2026-12-20",
      notes: "Doe dit óf online via kvk.nl, óf via je accountant. Deadline: zo snel mogelijk na KvK-inschrijving",
    },
    {
      id: "bank-kvk",
      title: "KvK-nummer naar bank",
      description: "Geef je KvK-nummer aan je bank (TransIP of zakelijke rekening) zodat ze het kunnen registreren.",
      status: "pending",
      dueDate: "2027-01-07",
      notes: "Dit is geen deadline, maar wel nodig voor correcte administratie",
    },
  ];

  const allDone = items.every((i) => i.status === "done");
  const inProgress = items.filter((i) => i.status === "in-progress").length;
  const overallStatus: KvKStatus["overallStatus"] = allDone
    ? "complete"
    : daysRemaining <= 0
      ? "overdue"
      : daysRemaining <= 3
        ? "at-risk"
        : inProgress > 0 || items.some((i) => i.status === "done")
          ? "on-track"
          : "not-started";

  return {
    deadline: "2026-12-17",
    daysUntilDeadline: Math.max(0, daysRemaining),
    items,
    overallStatus,
    estimatedCost: "€ 50–200 (KvK-bijdrage + eventueel vertaling/kantoorpand)",
  };
}

export const KVK_INSTRUCTIONS = `
## KvK-registratie voor buitenlandse onderneming — Stap voor stap

### Wat is het?
De KvK (Kamer van Koophandel) is het Nederlands bedrijfsregister. Buitenlandse bedrijven die in
Nederland werken, moeten zich inschrijven. Voor Zekerflex, Inc. (Delaware) is dit vereist omdat
je vanuit Nederland werkt, ook al ben je een Amerikaanse BV.

### Hoe snel?
- Online (kvk.nl): 24 uur
- Per post: 5–7 werkdagen
- In persoon op een KvK-loket: direct

### Documentenanvraag
1. **Certificate of Incorporation** (originaliteit bewijzen)
   - Via Stripe Atlas: download het
   - Vertaald naar Nederlands (of Engels geaccepteerd, maar check eerst met KvK)

2. **Bewijs van vestigingsadres in Nederland**
   - Huurcontract, eigendomsakte of verklaring van de verhuurder
   - Recente rekeningafschrift op dat adres (niet ouder dan 3 maanden)

3. **Identificatie eigenaar**
   - Paspoort of ID-kaart van de bevoegd persoon (ondertekening)

4. **Formulier 'Registratie buitenlandse onderneming'**
   - Download van kvk.nl, of vul online in

### Voor Zekerflex, Inc. specifiek
- **Vestigingsadres:** Waar werkt de eigenaar? (privé-adres kan, kantoor is beter)
- **Activiteiten:** "Flexwork platform" / "Uitzendbureau"
- **Eigenaar:** De oprichter/eigenaar uit Delaware
- **Bevoegd persoon:** Wie mag handelen namens het bedrijf (waarschijnlijk jij)

### Na KvK-inschrijving
Automatisch krijg je:
- **KvK-nummer** (8 cijfers, bv. 12345678)
- **Btw-nummernummer** als je je registreert (NL + 10 cijfers)
- Deze kun je gebruiken voor facturen, belastingen en Wtta-inschrijving

### Kosten
- KvK-bijdrage: € 55 (eenmalig)
- Vertaling (als nodig): € 50–150
- **Totaal ongeveer € 55–200**

### Volgende stap
Zodra je KvK-ingeschreven bent:
1. Geef het nummer aan de accountant
2. Registreer je voor btw (volgt automatisch of via je accountant)
3. Schrijf je in bij de Wtta (uitzendvergunnng, deadline 31-12-2026)
`.trim();

export const KVK_CONTACTS = {
  website: "https://www.kvk.nl",
  englishInfo: "https://www.kvk.nl/english/registration/",
  registrationForm: "https://www.kvk.nl/english/registration/how-to-register/",
  phone: "+31 (0)88 - 969 30 00",
  hours: "Maandag–vrijdag 8:00–18:00 CET",
};
