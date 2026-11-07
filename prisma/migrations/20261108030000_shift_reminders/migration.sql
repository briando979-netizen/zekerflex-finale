-- AddColumn: reminderSent1h to ShiftAssignment
ALTER TABLE "ShiftAssignment" ADD COLUMN "reminderSent1h" BOOLEAN NOT NULL DEFAULT false;
