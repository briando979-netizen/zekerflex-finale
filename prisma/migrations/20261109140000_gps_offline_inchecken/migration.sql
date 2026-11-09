-- Inchecken en uitchecken zonder bereik (lib/timesheets/offline.ts): de bron van een GPS-event,
-- wanneer een offline bewaard event binnenkwam, en de eigen id van de telefoon per tik (dubbel
-- versturen telt één keer). Alleen nieuwe, lege kolommen: bestaande rijen blijven zoals ze zijn.

-- AlterTable
ALTER TABLE "GpsEvent" ADD COLUMN     "bron" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "ontvangenOp" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "GpsEvent_timesheetId_clientId_key" ON "GpsEvent"("timesheetId", "clientId");
