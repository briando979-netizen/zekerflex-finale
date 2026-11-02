import type { AuditCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeAuditHash, GENESIS_HASH } from "@/lib/audit-chain";

// Fixed advisory-lock key so audit writes serialise (the hash chain needs a
// deterministic predecessor). "ZFAUD" as an int32.
const AUDIT_LOCK_KEY = 0x5a464155;

// ---------------------------------------------------------------------------
// Audit trail writer.
//
// `recordAudit` appends one row to `AuditLog` and NEVER throws: a failed audit
// write is logged and swallowed so it can't abort the business operation that
// is being recorded. Call it after the operation's own transaction commits.
// ---------------------------------------------------------------------------

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditInput {
  category: AuditCategory;
  /** Dotted verb, past tense: "timesheet.approved", "auth.login.failed". */
  action: string;
  /** One-line human summary (shown in the console). */
  summary: string;
  severity?: AuditSeverity;
  /** DB user id of the acting principal, or null for system / integration events. */
  actorUserId?: string | null;
  /** Human hint when there is no user: "system", "integration:didit", ... */
  actorLabel?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** Serialised to JSONB; anything JSON-encodable. */
  metadata?: unknown;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const createdAt = new Date();
  const severity = input.severity ?? "info";
  const actorUserId = input.actorUserId ?? null;
  const actorLabel = input.actorLabel ?? (actorUserId ? "user" : "system");
  const targetType = input.targetType ?? null;
  const targetId = input.targetId ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      // Serialise audit writes so the chain has a deterministic predecessor.
      // $executeRaw (not $queryRaw): pg_advisory_xact_lock returns void.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;

      const row = await tx.auditLog.create({
        data: {
          category: input.category,
          action: input.action,
          summary: input.summary,
          severity,
          actorUserId,
          actorLabel,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          targetType,
          targetId,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          createdAt,
        },
        select: { id: true, seq: true },
      });

      const prev = await tx.auditLog.findFirst({
        where: { seq: { lt: row.seq }, hash: { not: null } },
        orderBy: { seq: "desc" },
        select: { hash: true },
      });
      const prevHash = prev?.hash ?? GENESIS_HASH;

      const hash = computeAuditHash({
        seq: row.seq,
        prevHash,
        category: input.category,
        action: input.action,
        severity,
        actorUserId,
        actorLabel,
        targetType,
        targetId,
        createdAt,
      });

      await tx.auditLog.update({
        where: { id: row.id },
        data: { hash, prevHash },
      });
    });
  } catch (err) {
    logger.error("audit write failed", {
      action: input.action,
      error: (err as Error).message,
    });
  }
}

/**
 * Pull the client IP and user-agent from an incoming request's headers, for
 * attaching to an audit entry. Trusts the first hop of `x-forwarded-for`.
 */
export function auditContext(req: { headers: Headers }): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded
    ? (forwarded.split(",")[0]?.trim() || null)
    : h.get("x-real-ip");
  return { ipAddress: ip ?? null, userAgent: h.get("user-agent") };
}

export interface AuditActor {
  id: string | null;
  email: string | null;
  name: string;
}

type ActorRef = { actorUserId: string | null; actorLabel: string };

/**
 * Who did it, for the audit views. AuditLog has no relation to User (deleting
 * an account must never rewrite a sealed row), so the names of a page of rows
 * are looked up in one query; an account that no longer exists keeps its id
 * and shows as "verwijderd account".
 */
export async function auditActors(rows: ActorRef[]): Promise<(row: ActorRef) => AuditActor> {
  const ids = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, fullName: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return (row) => {
    if (!row.actorUserId) return { id: null, email: null, name: row.actorLabel };
    const user = byId.get(row.actorUserId);
    return user
      ? { id: user.id, email: user.email, name: user.fullName }
      : { id: row.actorUserId, email: null, name: "verwijderd account" };
  };
}
