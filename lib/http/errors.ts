import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";

/**
 * Turn any thrown value into the platform's standard error response, carrying
 * whatever headers the error asks for (e.g. `Retry-After` on a 429). Use this
 * in the `catch` of public route handlers that aren't wrapped by
 * `withAuth`/`withAdminAccess` (which already do this via their own boundary).
 */
export function jsonError(err: unknown): NextResponse {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
}
