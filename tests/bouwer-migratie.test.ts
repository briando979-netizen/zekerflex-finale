import { beforeAll, describe, expect, it } from "vitest";

// De Bouwer mag de database alleen uitbreiden (deploy/bouwer/werker/werkkopie.mjs,
// maakMigratie). Deze controle staat tussen de door Prisma berekende SQL en de demo-
// en echte database: alles wat gegevens kan kwijtraken of op een gevulde tabel mislukt, weigert hij.

describe("Bouwer-migratie: welke SQL mag", () => {
  let bezwaren: (sql: string) => string[];

  beforeAll(async () => {
    // gewone .mjs zonder typen (draait in de bouwer-container)
    const pad = new URL("../deploy/bouwer/werker/werkkopie.mjs", import.meta.url).href;
    ({ bezwarenTegenSql: bezwaren } = (await import(/* @vite-ignore */ pad)) as { bezwarenTegenSql: (sql: string) => string[] });
  });

  it("laat nieuwe tabellen, optionele kolommen, kolommen met standaardwaarde en indexen door", () => {
    const sql = `-- CreateTable
CREATE TABLE "KlantNotitie" (
    "id" TEXT NOT NULL,
    "tekst" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KlantNotitie_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bijnaam" TEXT,
ADD COLUMN     "punten" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "KlantNotitie_createdAt_idx" ON "KlantNotitie"("createdAt");

-- AddForeignKey
ALTER TABLE "KlantNotitie" ADD CONSTRAINT "KlantNotitie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;`;
    expect(bezwaren(sql)).toEqual([]);
  });

  it("weigert weghalen, hernoemen, van type veranderen en verplicht maken", () => {
    expect(bezwaren('DROP TABLE "Oud";')).toEqual(["iets weghalen"]);
    expect(bezwaren('ALTER TABLE "User" DROP COLUMN "naam";')).toEqual(["iets weghalen"]);
    expect(bezwaren('DROP INDEX "BankEntry_createdAt_idx";')).toEqual(["iets weghalen"]);
    expect(bezwaren('ALTER TABLE "User" RENAME COLUMN "a" TO "b";')).toEqual(["iets hernoemen"]);
    expect(bezwaren('ALTER TABLE "User" ALTER COLUMN "leeftijd" SET DATA TYPE TEXT;')).toEqual(["een kolom van type veranderen"]);
    expect(bezwaren('ALTER TABLE "User" ALTER COLUMN "telefoon" SET NOT NULL;')).toEqual(["een bestaande kolom verplicht maken"]);
    expect(bezwaren('DELETE FROM "User";')).toEqual(["gegevens wissen, wijzigen of toevoegen"]);
  });

  it("weigert een verplichte nieuwe kolom zonder standaardwaarde op een bestaande tabel", () => {
    const sql = `ALTER TABLE "User" ADD COLUMN     "bijnaam" TEXT,
ADD COLUMN     "updatedOp" TIMESTAMP(3) NOT NULL;`;
    expect(bezwaren(sql)).toEqual(["een verplichte kolom zonder standaardwaarde toevoegen aan een bestaande tabel"]);
  });
});
