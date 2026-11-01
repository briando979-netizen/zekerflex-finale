-- One bulk checkout pays several invoices with a single payment intent. The
-- unique index made the second invoice fail, so only the first was marked paid.
DROP INDEX "Invoice_stripePaymentIntentId_key";

CREATE INDEX "Invoice_stripePaymentIntentId_idx" ON "Invoice"("stripePaymentIntentId");
