import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Audit hash chain.
//
// Each AuditLog row carries hash(seq, prevHash, identity fields). The chain
// deliberately excludes summary, ipAddress and userAgent so an AVG erasure can
// scrub those in place without invalidating the trail. metadata is also
// excluded (operational detail, sometimes large).
//
// GENESIS is the notional hash before the first sealed row.
// ---------------------------------------------------------------------------

export const GENESIS_HASH = "GENESIS";

// ASCII unit separator (0x1F) joins the canonical fields; it never appears in
// any of the input values, so field boundaries are unambiguous.
const SEP = String.fromCharCode(31);

export interface AuditChainFields {
  seq: bigint;
  prevHash: string;
  category: string;
  action: string;
  severity: string;
  actorUserId: string | null;
  actorLabel: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
}

export function computeAuditHash(f: AuditChainFields): string {
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

export interface ChainVerifyResult {
  ok: boolean;
  checked: number;
  /** Rows written before the chain migration (hash NULL) — not an error. */
  unsealed: number;
  firstBreakSeq: string | null;
  detail: string | null;
}

/**
 * Walk the sealed portion of the chain in seq order and confirm every link.
 * `fromSeq` lets a caller resume from a known-good checkpoint.
 */
export async function verifyAuditChain(
  opts: { fromSeq?: bigint; limit?: number } = {},
): Promise<ChainVerifyResult> {
  const take = opts.limit ?? 100_000;
  const rows = await prisma.auditLog.findMany({
    where: opts.fromSeq ? { seq: { gte: opts.fromSeq } } : {},
    orderBy: { seq: "asc" },
    take,
    select: {
      seq: true,
      hash: true,
      prevHash: true,
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

  let checked = 0;
  let unsealed = 0;
  let expectedPrev: string | null = null;

  for (const row of rows) {
    if (row.hash === null) {
      unsealed += 1;
      continue;
    }
    const prevHash = row.prevHash ?? GENESIS_HASH;

    if (expectedPrev !== null && prevHash !== expectedPrev) {
      return {
        ok: false,
        checked,
        unsealed,
        firstBreakSeq: row.seq.toString(),
        detail: `prevHash mismatch at seq ${row.seq}: expected ${expectedPrev}, got ${prevHash}`,
      };
    }

    const recomputed = computeAuditHash({
      seq: row.seq,
      prevHash,
      category: row.category,
      action: row.action,
      severity: row.severity,
      actorUserId: row.actorUserId,
      actorLabel: row.actorLabel,
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt,
    });
    if (recomputed !== row.hash) {
      return {
        ok: false,
        checked,
        unsealed,
        firstBreakSeq: row.seq.toString(),
        detail: `hash mismatch at seq ${row.seq}`,
      };
    }

    expectedPrev = row.hash;
    checked += 1;
  }

  return { ok: true, checked, unsealed, firstBreakSeq: null, detail: null };
}
