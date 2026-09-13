-- debtorIban is the platform's own funding account. Before SEPA_CREDITOR_IBAN
-- is configured there is no real value to record, and writing the sentinel
-- string "UNKNOWN" into Payment rows (and from there into SEPA files) is worse
-- than a NULL. Make the column nullable and scrub the sentinels.

ALTER TABLE "Payment" ALTER COLUMN "debtorIban" DROP NOT NULL;

UPDATE "Payment" SET "debtorIban" = NULL WHERE "debtorIban" = 'UNKNOWN';
