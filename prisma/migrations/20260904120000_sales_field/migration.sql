-- Buitendienst-sales: een SALES-rol + extra velden op SalesLead voor
-- bedrijfsbezoeken en het versturen van een account-uitnodiging.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SALES';

ALTER TABLE "SalesLead" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "SalesLead" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3);
ALTER TABLE "SalesLead" ADD COLUMN IF NOT EXISTS "invitedTenantId" TEXT;
