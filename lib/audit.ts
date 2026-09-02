import type { AuditCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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
  try {
    await prisma.auditLog.create({
      data: {
        category: input.category,
        action: input.action,
        summary: input.summary,
        severity: input.severity ?? "info",
        actorUserId: input.actorUserId ?? null,
        actorLabel:
          input.actorLabel ?? (input.actorUserId ? "user" : "system"),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
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
