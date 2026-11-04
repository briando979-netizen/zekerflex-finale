-- AlterTable
ALTER TABLE "HorecaZaak" ADD COLUMN     "btwNummer" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kassa" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "HorecaItem" ADD COLUMN     "btw" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "opties" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "voorraad" INTEGER;

-- AlterTable
ALTER TABLE "HorecaBetaling" ADD COLUMN     "bonNummer" INTEGER,
ADD COLUMN     "door" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "methode" TEXT NOT NULL DEFAULT 'ideal',
ADD COLUMN     "regels" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "HorecaBetaling_zaakId_bonNummer_key" ON "HorecaBetaling"("zaakId", "bonNummer");

