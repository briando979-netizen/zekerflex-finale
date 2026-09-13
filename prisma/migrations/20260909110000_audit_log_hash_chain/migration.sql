-- Tamper-evident audit chain. Adds a monotonic `seq`, and `hash`/`prevHash`
-- that link each row to the previous one. The hash covers the immutable
-- identity fields only (not summary / ipAddress / userAgent), so AVG
-- anonymisation can scrub PII in place without breaking the chain.
--
-- Existing rows get a `seq` in creation order; their hashes stay NULL until
-- `scripts/backfill-audit-chain.mjs` seals the historical segment.

CREATE SEQUENCE IF NOT EXISTS "AuditLog_seq_seq";

ALTER TABLE "AuditLog" ADD COLUMN "seq" BIGINT;
ALTER TABLE "AuditLog" ADD COLUMN "hash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;

WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "AuditLog"
)
UPDATE "AuditLog" a
SET "seq" = o.rn
FROM ordered o
WHERE a."id" = o."id";

SELECT setval(
  '"AuditLog_seq_seq"',
  COALESCE((SELECT MAX("seq") FROM "AuditLog"), 0) + 1,
  false
);

ALTER TABLE "AuditLog" ALTER COLUMN "seq" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "seq" SET DEFAULT nextval('"AuditLog_seq_seq"');
ALTER SEQUENCE "AuditLog_seq_seq" OWNED BY "AuditLog"."seq";

CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");
CREATE INDEX "AuditLog_seq_idx" ON "AuditLog"("seq");
