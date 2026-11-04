-- "Extra informatie" bij een klus (melden, parkeren, meenemen): één nullable kolom, alleen toevoegen.
ALTER TABLE "Shift" ADD COLUMN "extraInfo" TEXT;
