#!/usr/bin/env node
// Seals AuditLog rows written before the hash-chain migration: walks the
// unsealed rows in `seq` order and fills in `hash` / `prevHash`. Idempotent —
// rows that already have a hash are skipped. Run once after deploying
// migration 20260909110000.
//
//   node scripts/backfill-audit-chain.mjs [--dry-run]

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const SEP = String.fromCharCode(31);
const GENESIS_HASH = "GENESIS";
const dryRun = process.argv.includes("--dry-run");

function computeAuditHash(f) {
  const canonical = [
    f.seq.toString(),
    f.prevHash,
    f.category,
    f.action,
    f.severity,
    f.actorUserId ?? "",
    f.actorLabel,
    f.targetType ?? "",
    f.targetId ?? "",
    f.createdAt.toISOString(),
  ].join(SEP);
  return createHash("sha256").update(canonical).digest("hex");
}

const prisma = new PrismaClient();

try {
  const lastSealed = await prisma.auditLog.findFirst({
    where: { hash: { not: null } },
    orderBy: { seq: "desc" },
    select: { seq: true, hash: true },
  });

  let prevHash = lastSealed?.hash ?? GENESIS_HASH;
  const startSeq = lastSealed?.seq ?? 0n;

  const rows = await prisma.auditLog.findMany({
    where: { hash: null, seq: { gt: startSeq } },
    orderBy: { seq: "asc" },
    select: {
      id: true,
      seq: true,
      category: true,
      action: true,
      severity: true,
      actorUserId: true,
      actorLabel: true,
      targetType: true,
      targetId: true,
      createdAt: true,
    },
  });

  console.log(`${rows.length} unsealed row(s) to seal${dryRun ? " (dry run)" : ""}`);

  let sealed = 0;
  for (const row of rows) {
    const hash = computeAuditHash({ ...row, prevHash });
    if (!dryRun) {
      await prisma.auditLog.update({
        where: { id: row.id },
        data: { hash, prevHash },
      });
    }
    prevHash = hash;
    sealed += 1;
  }

  console.log(`Done. ${dryRun ? "would seal" : "sealed"} ${sealed} row(s). Chain head: ${prevHash}`);
} finally {
  await prisma.$disconnect();
}
