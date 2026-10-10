import { isValidIban } from "@/lib/billing/sepa";

// ---------------------------------------------------------------------------
// SEPA Credit Transfer batch (ISO 20022 pain.001.001.03) — a bulk-payment XML
// file any Dutch business bank accepts for import ("verzamelbetaling" /
// batch payment upload). This is the real "next step" the weekly payroll
// engine stopped short of: finaliseRun() used to just flip a status with no
// payment artifact at all. A human still reviews and submits the batch in
// their own banking environment — this never calls a bank API or moves money
// itself, by design (see lib/payroll/sepa-export.ts).
//
// BIC is intentionally omitted (IBAN-only, "NOTPROVIDED" convention) per the
// SEPA Regulation (EU) 260/2012 art. 5(8), in effect since 2016: a BIC is no
// longer required for domestic/intra-EEA transfers, and ZekerFlex never
// collects a worker's BIC — only their IBAN.
// ---------------------------------------------------------------------------

export interface SepaBatchLine {
  /** Unique per batch, <= 35 chars. */
  endToEndId: string;
  creditorName: string;
  creditorIban: string;
  amountCents: number;
  /** Unstructured remittance text shown on the worker's bank statement. */
  remittanceInfo: string;
}

export interface SepaBatchInput {
  /** Unique message id, <= 35 chars. */
  messageId: string;
  debtorName: string;
  debtorIban: string;
  /** YYYY-MM-DD */
  requestedExecutionDate: string;
  lines: SepaBatchLine[];
}

export interface SepaBatchLineResult {
  line: SepaBatchLine;
  ok: boolean;
  reason?: string;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** SEPA "Latin character set" — strip anything a bank's pain.001 parser might reject. */
function sepaText(s: string, maxLen: number): string {
  const cleaned = s
    .normalize("NFKD")
    .replace(/[^\sA-Za-z0-9/\-?:().,'+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return xmlEscape(cleaned.slice(0, maxLen));
}

const cents2euro = (c: number) => (c / 100).toFixed(2);

/**
 * Validates every line (IBAN, positive amount) and returns which ones made
 * it into the batch vs. were skipped — a single bad IBAN must never block
 * everyone else's wages. Callers (lib/payroll/sepa-export.ts) surface the
 * skipped list so an admin can fix it manually instead of it failing silently.
 */
export function buildSepaCreditTransferBatch(
  input: SepaBatchInput,
): { xml: string | null; results: SepaBatchLineResult[] } {
  const debtorIban = input.debtorIban.replace(/\s+/g, "").toUpperCase();
  if (!isValidIban(debtorIban)) {
    throw new Error(`Debtor IBAN failed checksum validation: ${debtorIban}`);
  }

  const results: SepaBatchLineResult[] = input.lines.map((line) => {
    if (line.amountCents <= 0) return { line, ok: false, reason: "Bedrag is niet positief" };
    const iban = line.creditorIban.replace(/\s+/g, "").toUpperCase();
    if (!isValidIban(iban)) return { line, ok: false, reason: "IBAN ongeldig of ontbreekt" };
    return { line: { ...line, creditorIban: iban }, ok: true };
  });

  const okLines = results.filter((r) => r.ok).map((r) => r.line);
  // A pain.001 PmtInf block with zero transactions is not a valid batch — if
  // nothing is payable, there is simply no file to generate this week.
  if (okLines.length === 0) {
    return { xml: null, results };
  }
  const nbOfTxs = okLines.length;
  const ctrlSum = okLines.reduce((s, l) => s + l.amountCents, 0);

  const txXml = okLines
    .map(
      (l) => `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${xmlEscape(l.endToEndId.slice(0, 35))}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${cents2euro(l.amountCents)}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <Othr>
              <Id>NOTPROVIDED</Id>
            </Othr>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${sepaText(l.creditorName, 70)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${l.creditorIban}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${sepaText(l.remittanceInfo, 140)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xmlEscape(input.messageId.slice(0, 35))}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${cents2euro(ctrlSum)}</CtrlSum>
      <InitgPty>
        <Nm>${sepaText(input.debtorName, 70)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xmlEscape(`${input.messageId}-1`.slice(0, 35))}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${cents2euro(ctrlSum)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${input.requestedExecutionDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${sepaText(input.debtorName, 70)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${debtorIban}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <Othr>
            <Id>NOTPROVIDED</Id>
          </Othr>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${txXml}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;

  return { xml, results };
}
