import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { jsonError } from "@/lib/http/errors";
import { sendUserPush } from "@/lib/notifications/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/push/test — stuurt een test-melding naar de eigen apparaten van
// de ingelogde gebruiker (zo controleer je of pushmeldingen echt binnenkomen,
// óók als de app dicht staat). Geeft terug naar hoeveel apparaten het ging.
export async function POST(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const delivered = await sendUserPush([p.userId], {
      title: "🔔 Testmelding van ZekerFlex",
      body: "Top — je meldingen werken. Zo krijg je straks een seintje bij een dienst die begint.",
      data: { type: "TEST", url: "/dashboard", tag: "zf-test" },
      ttlSeconds: 120,
    });
    return NextResponse.json({ ok: true, delivered });
  } catch (err) {
    return jsonError(err);
  }
}
