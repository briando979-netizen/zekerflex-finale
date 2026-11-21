import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { markeerAllesToegevoegd, testers, verwijderTester } from "@/lib/app/testers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Google Play → Testers voor de Android-app: de lijst, alles als toegevoegd markeren en één adres wissen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ testers: await testers() }));

const bodySchema = z.object({ actie: z.enum(["alles-toegevoegd"]) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  bodySchema.parse(await request.json().catch(() => ({})));
  return NextResponse.json({ testers: await markeerAllesToegevoegd() });
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const email = new URL(request.url).searchParams.get("email") ?? "";
  return NextResponse.json({ testers: await verwijderTester(email.trim().toLowerCase()) });
});
