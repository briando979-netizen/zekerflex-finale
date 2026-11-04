-- CreateTable
CREATE TABLE "RijschoolBericht" (
    "id" TEXT NOT NULL,
    "rijschoolId" TEXT NOT NULL,
    "leerlingId" TEXT NOT NULL,
    "vanLeerling" BOOLEAN NOT NULL,
    "afzender" TEXT NOT NULL DEFAULT '',
    "tekst" TEXT NOT NULL,
    "gelezenOm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RijschoolBericht_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RijschoolBericht_leerlingId_createdAt_idx" ON "RijschoolBericht"("leerlingId", "createdAt");

-- CreateIndex
CREATE INDEX "RijschoolBericht_rijschoolId_createdAt_idx" ON "RijschoolBericht"("rijschoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "RijschoolBericht" ADD CONSTRAINT "RijschoolBericht_rijschoolId_fkey" FOREIGN KEY ("rijschoolId") REFERENCES "Rijschool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RijschoolBericht" ADD CONSTRAINT "RijschoolBericht_leerlingId_fkey" FOREIGN KEY ("leerlingId") REFERENCES "RijschoolLeerling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

