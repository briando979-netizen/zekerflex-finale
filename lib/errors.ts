/**
 * Typed application errors. Each carries an HTTP status and a stable machine
 * code so API routes can translate them into consistent JSON responses.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "COMPLIANCE_BLOCKED"
  | "PAYMENT_FAILED"
  | "RATE_LIMITED"
  | "NAAM_VASTGEZET"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static unauthenticated(message = "Je bent niet (meer) ingelogd. Log opnieuw in.") {
    return new AppError("UNAUTHENTICATED", message, 401);
  }
  static forbidden(message = "Dit mag je niet doen.") {
    return new AppError("FORBIDDEN", message, 403);
  }
  static notFound(message = "Niet gevonden.") {
    return new AppError("NOT_FOUND", message, 404);
  }
  static validation(message: string, details?: unknown) {
    return new AppError("VALIDATION_FAILED", message, 422, details);
  }
  static conflict(message: string) {
    return new AppError("CONFLICT", message, 409);
  }
  static precondition(message: string) {
    return new AppError("PRECONDITION_FAILED", message, 412);
  }
  static complianceBlocked(message: string, details?: unknown) {
    return new AppError("COMPLIANCE_BLOCKED", message, 451, details);
  }
  static paymentFailed(message: string, details?: unknown) {
    return new AppError("PAYMENT_FAILED", message, 502, details);
  }
  static rateLimited(
    message = "Te veel verzoeken — probeer het straks opnieuw.",
    retryAfterSeconds = 60,
    limit?: number,
  ) {
    return new AppError("RATE_LIMITED", message, 429, { retryAfterSeconds, limit });
  }
  /** 423: de naam is met een identiteitsbewijs of bank-inlog bevestigd en staat vast (geen 403: CrowdSec). */
  static naamVastgezet(message: string) {
    return new AppError("NAAM_VASTGEZET", message, 423);
  }
  static upstream(message: string) {
    return new AppError("UPSTREAM_UNAVAILABLE", message, 503);
  }

  /** Response headers this error should carry (e.g. Retry-After, RateLimit-*). */
  get headers(): Record<string, string> {
    if (this.code === "RATE_LIMITED") {
      const details = this.details as { retryAfterSeconds?: number; limit?: number } | undefined;
      const headers: Record<string, string> = {};
      if (typeof details?.retryAfterSeconds === "number" && details.retryAfterSeconds > 0) {
        headers["Retry-After"] = String(Math.ceil(details.retryAfterSeconds));
        headers["RateLimit-Reset"] = String(Math.ceil(details.retryAfterSeconds));
      }
      if (typeof details?.limit === "number") {
        headers["RateLimit-Limit"] = String(details.limit);
        headers["RateLimit-Remaining"] = "0";
      }
      return headers;
    }
    return {};
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

interface ZodLikeError {
  name: string;
  issues: unknown[];
  flatten?: () => unknown;
}

function isZodError(err: unknown): err is ZodLikeError {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; issues?: unknown; flatten?: unknown };
  if (!Array.isArray(e.issues)) return false;
  return e.name === "ZodError" || typeof e.flatten === "function";
}

type UnexpectedErrorReporter = (err: unknown) => void;
// On globalThis: the server build holds several copies of this module (see lib/logger.ts).
const shared = globalThis as typeof globalThis & { __zfUnexpectedErrorReporter?: UnexpectedErrorReporter | null };

/**
 * Node server only (lib/ops/error-journal.ts, started from instrumentation.ts):
 * who hears about an error that becomes a bare 500. Without it such an error
 * left no trace in routes that aren't wrapped by withAuth.
 */
export function setUnexpectedErrorReporter(fn: UnexpectedErrorReporter | null): void {
  shared.__zfUnexpectedErrorReporter = fn;
}

/** `logged`: the caller logs the 500 itself (withAuth's boundary), so don't report it twice. */
export function toErrorBody(err: unknown, opts: { logged?: boolean } = {}): {
  status: number;
  body: ErrorBody;
  headers: Record<string, string>;
} {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
      headers: err.headers,
    };
  }
  if (isZodError(err)) {
    return {
      status: 422,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "Niet alle gegevens zijn goed ingevuld. Controleer je invoer.",
          details: err.flatten ? err.flatten() : err.issues,
        },
      },
      headers: {},
    };
  }
  if (!opts.logged) {
    try {
      shared.__zfUnexpectedErrorReporter?.(err);
    } catch {
      // reporting may never change the response
    }
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Er ging iets mis aan onze kant. Probeer het later opnieuw." } },
    headers: {},
  };
}
