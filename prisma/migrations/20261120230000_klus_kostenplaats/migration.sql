-- Kostenplaats / PO-nummer op een klus (naar YoungOnes en Temper): gekozen uit de kostenplaatsen van het bedrijf
-- (OrgProfileExtra.costCentres) bij het plaatsen, zichtbaar op de klus, de facturen en in de CSV-export voor de
-- boekhouding. Alleen toevoegen, leeg toegestaan: bestaande klussen en de oude code werken ongewijzigd door.

SET lock_timeout = '5s';

ALTER TABLE "Shift" ADD COLUMN "kostenplaats" TEXT;
