-- Marketing Campaigns & Deals system
CREATE TABLE IF NOT EXISTS "MarketingCampaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "videoUrl" TEXT,
  "thumbnailUrl" TEXT,
  "type" TEXT NOT NULL DEFAULT 'PROMOTIONAL',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "targetAudience" TEXT NOT NULL DEFAULT 'ALL',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "conversionCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MarketingDeal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
  "discountValue" DECIMAL(10,2) NOT NULL,
  "campaignId" TEXT,
  "videoUrl" TEXT,
  "thumbnailUrl" TEXT,
  "code" TEXT UNIQUE,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "targetAudience" TEXT NOT NULL DEFAULT 'ALL',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "conversionCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "MarketingAnalytics" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaignId" TEXT,
  "dealId" TEXT,
  "date" DATE NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "conversions" INTEGER NOT NULL DEFAULT 0,
  "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE,
  FOREIGN KEY ("dealId") REFERENCES "MarketingDeal"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "MarketingCampaign_status_idx" ON "MarketingCampaign"("status");
CREATE INDEX IF NOT EXISTS "MarketingCampaign_startDate_idx" ON "MarketingCampaign"("startDate");
CREATE INDEX IF NOT EXISTS "MarketingDeal_status_idx" ON "MarketingDeal"("status");
CREATE INDEX IF NOT EXISTS "MarketingDeal_code_idx" ON "MarketingDeal"("code");
