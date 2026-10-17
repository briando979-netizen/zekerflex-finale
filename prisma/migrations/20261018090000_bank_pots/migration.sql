-- CreateTable
CREATE TABLE "BankPot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🎯',
    "kind" TEXT NOT NULL DEFAULT 'POT',
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "targetCents" INTEGER,
    "termYears" INTEGER,
    "interestBps" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankPot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankPot_accountId_idx" ON "BankPot"("accountId");

-- AddForeignKey
ALTER TABLE "BankPot" ADD CONSTRAINT "BankPot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

