import { describe, expect, it } from "vitest";
import { buildSepaCreditTransferBatch } from "@/lib/billing/sepa-batch";

// finaliseRun() used to stop at flipping a status — no bank-ready payment
// file at all. This is the real artifact: a pain.001.001.03 batch any Dutch
// bank accepts for a bulk-payment import.

const VALID_DEBTOR_IBAN = "NL91ABNA0417164300";
const VALID_CREDITOR_IBAN = "NL39RABO0300065264";

describe("buildSepaCreditTransferBatch", () => {
  it("produces a valid-shaped pain.001 document with matching control totals", () => {
    const { xml, results } = buildSepaCreditTransferBatch({
      messageId: "ZF-PAYROLL-2026-W35",
      debtorName: "ZekerFlex B.V.",
      debtorIban: VALID_DEBTOR_IBAN,
      requestedExecutionDate: "2026-09-01",
      lines: [
        { endToEndId: "ZF-2026-W35-0001", creditorName: "Jan de Vries", creditorIban: VALID_CREDITOR_IBAN, amountCents: 12345, remittanceInfo: "ZekerFlex loon week 35" },
      ],
    });

    expect(results.every((r) => r.ok)).toBe(true);
    expect(xml).toContain("urn:iso:std:iso:20022:tech:xsd:pain.001.001.03");
    expect(xml).toContain("<NbOfTxs>1</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>123.45</CtrlSum>");
    expect(xml).toContain(`<IBAN>${VALID_DEBTOR_IBAN}</IBAN>`);
    expect(xml).toContain(`<IBAN>${VALID_CREDITOR_IBAN}</IBAN>`);
    expect(xml).toContain("<InstdAmt Ccy=\"EUR\">123.45</InstdAmt>");
    expect(xml).toContain("<Nm>Jan de Vries</Nm>");
    // BIC is intentionally never required (SEPA Regulation art. 5(8)).
    expect(xml).toContain("<Id>NOTPROVIDED</Id>");
  });

  it("throws on an invalid debtor IBAN — a bad company account must never produce a file", () => {
    expect(() =>
      buildSepaCreditTransferBatch({
        messageId: "ZF-PAYROLL-2026-W35",
        debtorName: "ZekerFlex B.V.",
        debtorIban: "NL00BOGUS0000000000",
        requestedExecutionDate: "2026-09-01",
        lines: [{ endToEndId: "e1", creditorName: "Jan", creditorIban: VALID_CREDITOR_IBAN, amountCents: 100, remittanceInfo: "x" }],
      }),
    ).toThrow();
  });

  it("excludes a line with an invalid/missing IBAN without touching the others", () => {
    const { xml, results } = buildSepaCreditTransferBatch({
      messageId: "ZF-PAYROLL-2026-W35",
      debtorName: "ZekerFlex B.V.",
      debtorIban: VALID_DEBTOR_IBAN,
      requestedExecutionDate: "2026-09-01",
      lines: [
        { endToEndId: "ZF-2026-W35-0001", creditorName: "Jan de Vries", creditorIban: VALID_CREDITOR_IBAN, amountCents: 12345, remittanceInfo: "x" },
        { endToEndId: "ZF-2026-W35-0002", creditorName: "Kapotte Iban", creditorIban: "NL00ROTIBAN0000000", amountCents: 5000, remittanceInfo: "x" },
      ],
    });

    expect(results).toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: false, reason: expect.stringContaining("IBAN") }),
    ]);
    expect(xml).toContain("<NbOfTxs>1</NbOfTxs>");
    expect(xml).not.toContain("Kapotte Iban");
  });

  it("excludes a non-positive amount line", () => {
    const { results } = buildSepaCreditTransferBatch({
      messageId: "m",
      debtorName: "ZekerFlex B.V.",
      debtorIban: VALID_DEBTOR_IBAN,
      requestedExecutionDate: "2026-09-01",
      lines: [{ endToEndId: "e1", creditorName: "Jan", creditorIban: VALID_CREDITOR_IBAN, amountCents: 0, remittanceInfo: "x" }],
    });
    expect(results[0]).toMatchObject({ ok: false, reason: expect.stringContaining("Bedrag") });
  });

  it("returns a null xml (not a malformed empty batch) when every line is invalid", () => {
    const { xml, results } = buildSepaCreditTransferBatch({
      messageId: "m",
      debtorName: "ZekerFlex B.V.",
      debtorIban: VALID_DEBTOR_IBAN,
      requestedExecutionDate: "2026-09-01",
      lines: [{ endToEndId: "e1", creditorName: "Jan", creditorIban: "NL00BAD0000000000", amountCents: 100, remittanceInfo: "x" }],
    });
    expect(xml).toBeNull();
    expect(results[0]?.ok).toBe(false);
  });

  it("escapes XML-sensitive characters in names and remittance text", () => {
    const { xml } = buildSepaCreditTransferBatch({
      messageId: "m",
      debtorName: "ZekerFlex B.V.",
      debtorIban: VALID_DEBTOR_IBAN,
      requestedExecutionDate: "2026-09-01",
      lines: [{ endToEndId: "e1", creditorName: "A & B <Co>", creditorIban: VALID_CREDITOR_IBAN, amountCents: 100, remittanceInfo: "x" }],
    });
    // Disallowed SEPA characters (&, <, >) are stripped before escaping, so no
    // raw "&"/"<"/">" should ever reach the XML outside of real tags.
    expect(xml).not.toMatch(/<Nm>[^<]*[&<>][^<]*<\/Nm>/);
  });
});
