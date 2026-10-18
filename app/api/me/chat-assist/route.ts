import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { rewrite, suggestReplies } from "@/lib/chat/assist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("suggest"), lastIncoming: z.string().max(2000).default("") }),
  z.object({ mode: z.literal("rewrite"), text: z.string().trim().min(1).max(2000), style: z.enum(["vriendelijk", "kort", "zakelijk", "en", "pl", "de", "ro", "ar"]) }),
]);

// POST /api/me/chat-assist — reply suggestions or a rewrite/translation for the chat composer.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "chat-assist", identifier: p.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan met de AI-hulp." });
    const input = schema.parse(await request.json().catch(() => ({})));
    if (input.mode === "suggest") {
      const role = hasRole(p, "PLATFORM_ADMIN") ? "medewerker van ZekerFlex" : hasRole(p, "FREELANCER") ? "flexwerker" : "opdrachtgever";
      return NextResponse.json(await suggestReplies(input.lastIncoming, role));
    }
    return NextResponse.json(await rewrite(input.text, input.style));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
