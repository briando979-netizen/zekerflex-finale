-- "Extra kosten factureren": freelancer can bill pre-agreed extra costs
-- (VAT-inclusive) alongside the shift hours, added as a line on the self-bill
-- invoice at approval time.
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "extraCostsCents" INTEGER;
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "extraCostsNote" TEXT;
