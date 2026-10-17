-- CreateEnum
CREATE TYPE "BankOwnerType" AS ENUM ('USER', 'TENANT', 'PLATFORM');

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "ownerType" "BankOwnerType" NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "number" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "payoutIban" TEXT,
    "payoutName" TEXT,
    "frozenAt" TIMESTAMP(3),
    "frozenReason" TEXT,
    "nextFeeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankCard" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "stripeCardId" TEXT NOT NULL,
    "stripeCardholderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_userId_key" ON "BankAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_tenantId_key" ON "BankAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_number_key" ON "BankAccount"("number");

-- CreateIndex
CREATE UNIQUE INDEX "BankEntry_idempotencyKey_key" ON "BankEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BankEntry_accountId_createdAt_idx" ON "BankEntry"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankCard_stripeCardId_key" ON "BankCard"("stripeCardId");

-- CreateIndex
CREATE INDEX "BankCard_accountId_idx" ON "BankCard"("accountId");

-- AddForeignKey
ALTER TABLE "BankEntry" ADD CONSTRAINT "BankEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankCard" ADD CONSTRAINT "BankCard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
