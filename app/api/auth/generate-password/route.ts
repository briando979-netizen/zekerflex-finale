import { NextResponse } from "next/server";
import { generatePassword, scorePassword } from "@/lib/auth/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/generate-password — a strong suggested password for the form.
export function GET(): NextResponse {
  const password = generatePassword(16);
  return NextResponse.json({ password, ...scorePassword(password) });
}
