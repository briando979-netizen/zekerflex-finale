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

  static unauthenticated(message = "Authentication required") {
    return new AppError("UNAUTHENTICATED", message, 401);
  }
  static forbidden(message = "Not allowed") {
    return new AppError("FORBIDDEN", message, 403);
  }
  static notFound(message = "Resource not found") {
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
  static upstream(message: string) {
    return new AppError("UPSTREAM_UNAVAILABLE", message, 503);
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

export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }
  if (isZodError(err)) {
    return {
      status: 422,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request validation failed",
          details: err.flatten ? err.flatten() : err.issues,
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Unexpected server error" } },
  };
}
