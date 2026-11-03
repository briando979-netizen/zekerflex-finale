-- CreateTable
CREATE TABLE "RijschoolApp" (
    "id" TEXT NOT NULL,
    "rijschoolId" TEXT NOT NULL,
    "pakketnaam" TEXT NOT NULL,
    "appNaam" TEXT NOT NULL,
    "korteTekst" TEXT NOT NULL DEFAULT '',
    "langeTekst" TEXT NOT NULL DEFAULT '',
    "versie" INTEGER NOT NULL DEFAULT 0,
    "sleutel" TEXT,
    "uploadVingerafdruk" TEXT,
    "playVingerafdruk" TEXT,
    "aabUploadId" TEXT,
    "testersGroep" TEXT NOT NULL DEFAULT '',
    "gekoppeldOp" TIMESTAMP(3),
    "liveSinds" TIMESTAMP(3),
    "taakFase" TEXT NOT NULL DEFAULT '',
    "taak" JSONB NOT NULL DEFAULT '{}',
    "sporen" JSONB NOT NULL DEFAULT '{}',
    "logboek" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RijschoolApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolApp_rijschoolId_key" ON "RijschoolApp"("rijschoolId");

-- CreateIndex
CREATE UNIQUE INDEX "RijschoolApp_pakketnaam_key" ON "RijschoolApp"("pakketnaam");

-- AddForeignKey
ALTER TABLE "RijschoolApp" ADD CONSTRAINT "RijschoolApp_rijschoolId_fkey" FOREIGN KEY ("rijschoolId") REFERENCES "Rijschool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

