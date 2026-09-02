import { prisma } from "@/lib/prisma";
import { SimplePdf } from "@/lib/pdf/simple";

const euro = (c: number) => `EUR ${(c / 100).toFixed(2).replace(".", ",")}`;
const nlDate = (d: Date | string) => new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });

const VAT_LABEL: Record<string, string> = {
  STANDARD_RATE: "21% btw",
  REVERSE_CHARGE: "Btw verlegd",
  OUT_OF_SCOPE: "Buiten reikwijdte btw",
  ZERO_RATE: "0% btw",
};

const TYPE_LABEL: Record<string, string> = {
  SELF_BILL_FREELANCER: "Dienstfactuur (self-billing)",
  PLATFORM_FEE: "Platformkosten",
  REVERSE_BILL_CLIENT: "Factuur opdrachtgever",
};

/** Build an A4 PDF for a single invoice. Returns null if not found. */
export async function invoicePdf(invoiceId: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: true,
      issuerTenant: { select: { name: true } },
      recipientTenant: { select: { name: true } },
      timesheet: { select: { scheduledStart: true, branch: { select: { name: true } } } },
      payment: { select: { status: true, settledAt: true, amountCents: true } },
    },
  });
  if (!inv) return null;

  let issuerName = inv.issuerTenant?.name ?? "ZekerFlex";
  if (inv.issuerFreelancerId) {
    const fp = await prisma.freelancerProfile.findUnique({
      where: { id: inv.issuerFreelancerId },
      select: { user: { select: { fullName: true } }, kvkNumber: true, vatNumber: true },
    });
    if (fp) issuerName = `${fp.user.fullName}${fp.kvkNumber ? ` — KVK ${fp.kvkNumber}` : ""}`;
  }

  const pdf = new SimplePdf();
  pdf.heading("ZekerFlex", 20);
  pdf.line(TYPE_LABEL[inv.type] ?? inv.type, 11, { color: [0.05, 0.36, 0.29] });
  pdf.gap(8);
  pdf.rule();

  pdf.row("Factuurnummer", inv.number, { bold: true });
  pdf.row("Datum", nlDate(inv.issuedAt ?? inv.createdAt));
  pdf.row("Van", issuerName);
  pdf.row("Aan", inv.recipientTenant.name);
  if (inv.timesheet) {
    pdf.row("Werkdag", nlDate(inv.timesheet.scheduledStart));
    pdf.row("Locatie", inv.timesheet.branch.name);
  }
  pdf.gap(6);
  pdf.rule();

  pdf.line("Omschrijving", 10, { bold: true });
  pdf.gap(2);
  for (const l of inv.lines) {
    pdf.row(
      `${l.description}${l.quantity ? `  (${l.quantity.toFixed(2).replace(".", ",")} u x ${euro(l.unitPriceCents)})` : ""}`,
      euro(l.amountCents),
    );
  }
  pdf.gap(4);
  pdf.rule();

  pdf.row("Subtotaal", euro(inv.subtotalCents));
  pdf.row(VAT_LABEL[inv.vatTreatment] ?? "Btw", euro(inv.vatCents));
  pdf.row("Totaal", euro(inv.totalCents), { bold: true, size: 12 });

  pdf.gap(14);
  if (inv.payment) {
    const paid = inv.payment.status === "SETTLED";
    pdf.line(
      paid
        ? `Betaald${inv.payment.settledAt ? ` op ${nlDate(inv.payment.settledAt)}` : ""} via SEPA.`
        : "Betaalstatus: in behandeling.",
      9.5,
      { color: paid ? [0.05, 0.45, 0.2] : [0.45, 0.35, 0.05] },
    );
  }
  pdf.gap(18);
  pdf.line(
    "Deze factuur is automatisch aangemaakt door ZekerFlex (reverse billing / self-billing).",
    8.5,
    { color: [0.4, 0.45, 0.42] },
  );
  pdf.line("ZekerFlex Sovereign Box — 100% in Nederland gehost.", 8.5, { color: [0.4, 0.45, 0.42] });

  return { bytes: pdf.toBuffer(), filename: `${inv.number}.pdf` };
}

/** Build an A4 PDF for a model agreement. */
export async function agreementPdf(agreementId: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const a = await prisma.modelAgreement.findUnique({ where: { id: agreementId } });
  if (!a) return null;

  const pdf = new SimplePdf();
  pdf.heading("Modelovereenkomst", 20);
  pdf.line(`Referentie ${a.reference}`, 11, { color: [0.05, 0.36, 0.29] });
  pdf.gap(8);
  pdf.rule();

  pdf.row("Type", a.type.split("_").join(" ").toLowerCase());
  pdf.row("Status", a.status.split("_").join(" ").toLowerCase());
  pdf.row("Opdrachtnemer", a.freelancerLegalName ?? "—");
  pdf.row("Opdrachtgever", a.clientLegalName ?? "—");
  if (a.hourlyRateCents) pdf.row("Uurtarief", euro(a.hourlyRateCents));
  pdf.row("Aangemaakt", nlDate(a.createdAt));
  pdf.row("Getekend (opdrachtnemer)", a.freelancerSignedAt ? nlDate(a.freelancerSignedAt) : "nog niet");
  pdf.row("Getekend (opdrachtgever)", a.clientSignedAt ? nlDate(a.clientSignedAt) : "nog niet");
  pdf.gap(10);
  pdf.rule();

  pdf.line(
    "Deze overeenkomst is gebaseerd op een door de Belastingdienst beoordeelde modelovereenkomst.",
    9.5,
  );
  pdf.line(
    "Werken volgens deze overeenkomst betekent: vrije vervanging is toegestaan, geen gezagsverhouding,",
    9.5,
  );
  pdf.line("en de opdrachtnemer werkt voor eigen rekening en risico.", 9.5);
  pdf.gap(14);
  pdf.line("ZekerFlex bewaakt doorlopend de Wet DBA-signalen voor deze samenwerking.", 8.5, {
    color: [0.4, 0.45, 0.42],
  });

  return { bytes: pdf.toBuffer(), filename: `${a.reference}.pdf` };
}

/**
 * A blank ZekerFlex modelovereenkomst addressed to one person — used by
 * admins from the gebruikersdetail ("Maak overeenkomst") when there is no
 * specific dienst/opdracht yet to hang a real ModelAgreement record on.
 * Not signed, not stored — a ready document for the admin to send onward.
 */
export function blankAgreementPdf(personName: string): { bytes: Buffer; filename: string } {
  const pdf = new SimplePdf();
  pdf.heading("Modelovereenkomst", 20);
  pdf.line(`Opgesteld voor ${personName}`, 11, { color: [0.05, 0.36, 0.29] });
  pdf.gap(8);
  pdf.rule();

  pdf.row("Opdrachtnemer", personName);
  pdf.row("Platform", "ZekerFlex B.V.");
  pdf.row("Opgesteld op", nlDate(new Date()));
  pdf.row("Status", "concept — nog niet gekoppeld aan een opdracht");
  pdf.gap(10);
  pdf.rule();

  pdf.line(
    "Deze overeenkomst is gebaseerd op een door de Belastingdienst beoordeelde modelovereenkomst.",
    9.5,
  );
  pdf.line(
    "Werken volgens deze overeenkomst betekent: vrije vervanging is toegestaan, geen gezagsverhouding,",
    9.5,
  );
  pdf.line("en de opdrachtnemer werkt voor eigen rekening en risico.", 9.5);
  pdf.gap(10);
  pdf.line(
    "Zodra deze opdrachtnemer een dienst accepteert, genereert ZekerFlex automatisch de definitieve,",
    9.5,
  );
  pdf.line("aan die opdracht gekoppelde overeenkomst — inclusief tarief, opdrachtgever en handtekeningen.", 9.5);
  pdf.gap(14);
  pdf.line("ZekerFlex bewaakt doorlopend de Wet DBA-signalen voor elke samenwerking.", 8.5, {
    color: [0.4, 0.45, 0.42],
  });

  const safeName = personName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return { bytes: pdf.toBuffer(), filename: `modelovereenkomst-${safeName || "concept"}.pdf` };
}
