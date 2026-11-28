/**
 * US IRS Form 83(b) Checklist
 *
 * The 83(b) election allows founders to pay taxes on restricted stock at grant time
 * rather than at vesting, treating it as ordinary income. Must be filed within 30 days
 * of receiving the restricted stock grant.
 *
 * For Zekerflex, Inc.: Grant date 9 November 2026, Deadline 9 December 2026
 */

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "done";
  dueDate?: string;
  proof?: string;
  notes?: string;
}

export interface Form83bStatus {
  grantDate: string; // "2026-11-09"
  deadline: string; // "2026-12-09"
  daysUntilDeadline: number;
  items: ChecklistItem[];
  overallStatus: "on-track" | "at-risk" | "overdue" | "complete";
}

/**
 * Actions needed for the 83(b) filing.
 *
 * Status as of 2026-11-28:
 * - Form signed by owner on 2026-11-09
 * - Mailed via USPS Certified Mail on 2026-11-12
 * - Tracking: 92071902358909000045874400
 * - Now: Preserve proof and verify delivery by 2026-12-09
 */
export function form83bChecklist(today: Date): Form83bStatus {
  const grantDate = new Date("2026-11-09T00:00:00Z");
  const deadline = new Date("2026-12-09T23:59:59Z");
  const daysRemaining = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const items: ChecklistItem[] = [
    {
      id: "signed",
      title: "Form 83(b) ondertekend",
      description: "De eigenaar heeft het formulier ondertekend en gedateerd op de dag van de grant.",
      status: "done",
      dueDate: "2026-11-09",
      notes: "Ondertekend door Stripe Atlas op 2026-11-09",
    },
    {
      id: "submitted",
      title: "Verstuurd naar IRS (USPS Certified Mail)",
      description: "Het formulier moet per post naar het IRS Service Center voor je staat (zie Form 83(b) instructies). Geadviseerd: USPS Certified Mail met tracking.",
      status: "done",
      dueDate: "2026-11-12",
      proof: "USPS Certified Mail tracking 92071902358909000045874400",
      notes: "Verstuurd door Stripe Atlas op 2026-11-12",
    },
    {
      id: "proof-pdf",
      title: "Bewijs van verzending bewaard",
      description: "Sla het 'Proof of 83(b) filing' PDF-bestand van Stripe Atlas op in je bedrijfsadministratie.",
      status: daysRemaining > 10 ? "done" : "in-progress",
      notes: "Locatie: Atlas documenten → zekerflex-inc → 83(b) Filing",
    },
    {
      id: "tracking-verification",
      title: "Tracking-status controleren op USPS website",
      description: "Op usps.com kun je met het tracking-nummer verifiëren dat de brief is bezorgd op het IRS Service Center.",
      status: daysRemaining > 2 ? "in-progress" : "pending",
      dueDate: "2026-12-05",
      notes: "Tracking: 92071902358909000045874400 → Controleer op 2026-12-05 of bezorging bevestigd is",
    },
    {
      id: "records-organized",
      title: "Administratie klaar voor accountant",
      description: "Zet de tracking, het bewijs van verzending en de USPS-bevestiging samen in een map voor je belastingadviseur.",
      status: "pending",
      dueDate: "2026-12-09",
      notes: "Klaar als de USPS-tracking 'bezorgd' toont",
    },
  ];

  const allDone = items.every((i) => i.status === "done");
  const overallStatus: Form83bStatus["overallStatus"] =
    allDone ? "complete" : daysRemaining <= 0 ? "overdue" : daysRemaining <= 2 ? "at-risk" : "on-track";

  return {
    grantDate: "2026-11-09",
    deadline: "2026-12-09",
    daysUntilDeadline: Math.max(0, daysRemaining),
    items,
    overallStatus,
  };
}

export const FORM_83B_INSTRUCTIONS = `
## IRS Form 83(b) — Stap voor stap

### Wat is het?
De 83(b)-verklaring is een US belastingformulier voor werknemers/eigenaars die aandelen krijgen die
geleidelijk vrijvallen (vesting). Normaal betaal je belasting als de aandelen vrijvallen. Met 83(b)
betaal je nu meteen belasting op de waarde, en daarna geen belasting meer bij vesting.

### Voor Zekerflex, Inc.
- Datum van aandelen: 9 november 2026 (Stripe Atlas)
- Deadline IRS: 9 december 2026 (30 dagen later)
- Status: Ondertekend en verzonden op 12 november 2026 via USPS Certified Mail

### Wat moet je nu doen?
1. **Bewaar de tracking:** 92071902358909000045874400 op USPS.com controleren
2. **Collecteer bewijzen:**
   - "Proof of 83(b) filing" PDF van Stripe Atlas
   - USPS tracking screenshot of bevestigingsmail
   - Ondertekend formulier (als je dat hebt)
3. **Geef aan accountant:** Samen met je belastingaangifte over 2026 (IRS Form 1040 als jij de eigenaar bent)

### Waar bewijst het?
De IRS neemt aan dat het formulier is ontvangen als:
- Het is per USPS Certified Mail verzonden EN
- De tracking toont "bezorgd" op het IRS Service Center

Zie ook: IRS Publication 525, "Taxable and Nontaxable Income", sectie over restricted property elections.
`.trim();
