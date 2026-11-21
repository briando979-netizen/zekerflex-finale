import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDENEN = new Set(["GeenRol"]);

/**
 * Uitloggen via een gewone GET, voor als een pagina zelf niet mag uitloggen (een servercomponent kan geen cookie
 * wissen). Eerst gebruikt door /start (21 nov 2026): een ingelogd account dat bij geen bedrijf en geen werkersprofiel
 * meer hoort (bijv. na het wissen van een testbedrijf) bleef anders eindeloos tussen /start en /dashboard heen en weer
 * gaan, omdat de sessie nog de oude rol droeg ("zekerflex.com heeft je te vaak omgeleid" in de Android-app).
 * Achter Caddy is request.url de interne host; doorsturen gaat daarom naar APP_BASE_URL.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const reden = new URL(request.url).searchParams.get("reden") ?? "";
  const naar = new URL("/login", env.APP_BASE_URL);
  if (REDENEN.has(reden)) naar.searchParams.set("error", reden);
  const res = NextResponse.redirect(naar);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
}
