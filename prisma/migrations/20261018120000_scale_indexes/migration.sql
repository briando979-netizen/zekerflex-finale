-- Scale indexes (additive, no data changes).
-- Expression/partial indexes Prisma's schema language can't express; they
-- back lib/storage/kv.ts kvFindByField/kvFindDue and the bank's daily jobs.

-- Prefix scans (key LIKE 'bank-request:%') can use a btree only with
-- text_pattern_ops under a non-C collation.
CREATE INDEX IF NOT EXISTS "KeyValueStore_key_pattern_idx" ON "KeyValueStore" ("key" text_pattern_ops);

-- Per-account lookups of bank records stored in KV.
CREATE INDEX IF NOT EXISTS "KeyValueStore_bank_account_idx" ON "KeyValueStore" ((value->>'accountId'), "key") WHERE "key" LIKE 'bank-%';

-- Status lookups (pending withdrawals, active policies).
CREATE INDEX IF NOT EXISTS "KeyValueStore_bank_status_idx" ON "KeyValueStore" ((value->>'status'), "key") WHERE "key" LIKE 'bank-%';

-- Referral stats per referrer.
CREATE INDEX IF NOT EXISTS "KeyValueStore_ref_referrer_idx" ON "KeyValueStore" ((value->>'referrerId')) WHERE "key" LIKE 'ref-by:%';

-- Daily jobs: due standing orders / premiums.
CREATE INDEX IF NOT EXISTS "KeyValueStore_bank_due_idx" ON "KeyValueStore" ((value->>'nextRunAt')) WHERE "key" LIKE 'bank-standing:%';
CREATE INDEX IF NOT EXISTS "KeyValueStore_ins_due_idx" ON "KeyValueStore" ((value->>'nextPremiumAt')) WHERE "key" LIKE 'bank-ins-policy:%';

-- Bank tables: the overdraft sweep, monitoring/cockpit time scans, deposit maturity.
CREATE INDEX IF NOT EXISTS "BankAccount_negative_idx" ON "BankAccount" ("balanceCents") WHERE "balanceCents" < 0;
CREATE INDEX IF NOT EXISTS "BankAccount_nextFeeAt_idx" ON "BankAccount" ("nextFeeAt");
CREATE INDEX IF NOT EXISTS "BankEntry_createdAt_idx" ON "BankEntry" ("createdAt");
CREATE INDEX IF NOT EXISTS "BankPot_maturity_idx" ON "BankPot" ("lockedUntil") WHERE "kind" = 'FIXED' AND "closedAt" IS NULL;
