-- AlterTable
ALTER TABLE "CompanyRegistration" DROP COLUMN "foundationDate",
ADD COLUMN     "activities" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "registrationDate" TIMESTAMP(3),
ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "vatStatus" TEXT,
ADD COLUMN     "vatValid" BOOLEAN,
ADD COLUMN     "vatValidatedAt" TIMESTAMP(3);

