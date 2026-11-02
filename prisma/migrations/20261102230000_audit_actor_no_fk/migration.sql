-- actorUserId is part of every audit row's hash (lib/audit-chain.ts). Its
-- foreign key had ON DELETE SET NULL, so deleting an account (test accounts
-- after a live test) rewrote sealed rows and verifyAuditChain reported a break.
-- The audit log keeps the plain id instead; auditActors() looks names up.
BEGIN;

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorUserId_fkey";

-- Put back the ids that SET NULL wiped. Every account that acts has logged in
-- first, so the candidates are the ids in auth.login.succeeded rows. A row only
-- changes when its own hash proves the candidate is the original value.
WITH candidates AS (
  SELECT DISTINCT "targetId" AS id FROM "AuditLog"
  WHERE action = 'auth.login.succeeded' AND "targetType" = 'user' AND "targetId" IS NOT NULL
),
wiped AS (
  SELECT * FROM "AuditLog"
  WHERE hash IS NOT NULL AND "actorUserId" IS NULL AND "actorLabel" = 'user'
),
proven AS (
  SELECT DISTINCT ON (w.id) w.id, c.id AS actor
  FROM wiped w CROSS JOIN candidates c
  WHERE w.hash = encode(sha256(convert_to(concat_ws(chr(31),
    w.seq::text, coalesce(w."prevHash", 'GENESIS'), w.category::text, w.action, w.severity,
    c.id, w."actorLabel", coalesce(w."targetType", ''), coalesce(w."targetId", ''),
    to_char(w."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), 'UTF8')), 'hex')
)
UPDATE "AuditLog" a SET "actorUserId" = p.actor FROM proven p WHERE a.id = p.id;

COMMIT;
