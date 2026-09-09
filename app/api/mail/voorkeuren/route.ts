import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { findByToken, mailPrefsView, setCategory, setUnsubscribedAll } from "@/lib/mail/prefs";
import { isOptionalCategory } from "@/lib/mail/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(16).max(64),
  category: z.string().optional(),
  on: z.boolean().optional(),
  unsubscribeAll: z.boolean().optional(),
});

// POST /api/mail/voorkeuren — token-based (no login) update of one toggle.
// Rate-limited per IP against brute-forcing the token.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "mail-voorkeuren",
      identifier: clientIp(request),
      limit: 20,
      windowSeconds: 600,
      message: "Te veel pogingen — probeer het later opnieuw.",
    });

    const { token, category, on, unsubscribeAll } = schema.parse(await request.json().catch(() => ({})));
    const rec = await findByToken(token);
    if (!rec) throw AppError.notFound("Ongeldige of verlopen link.");

    if (typeof unsubscribeAll === "boolean") {
      await setUnsubscribedAll(rec.email, unsubscribeAll);
    } else if (category && isOptionalCategory(category) && typeof on === "boolean") {
      await setCategory(rec.email, category, on);
    } else {
      throw AppError.validation("Niets om aan te passen.");
    }

    const view = await mailPrefsView(rec.email);
    return NextResponse.json({ ok: true, ...view });
  } catch (err) {
    return jsonError(err);
  }
}
