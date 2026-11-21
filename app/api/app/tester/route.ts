import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { schoonTesterAdres } from "@/lib/app/testers-kern";
import { voegTesterToe } from "@/lib/app/testers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().min(3).max(254) });

// POST /api/app/tester (21 nov 2026): een bezoeker wil de Android-testversie. Het adres komt op de lijst in Beheer → Google
// Play; de eigenaar zet het in de Play Console op de testerslijst. Openbaar (lib/auth/public-routes.ts), per IP begrensd; geen
// mail (de mailbox zit soms aan zijn daggrens).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "app-tester", identifier: clientIp(request), limit: 5, windowSeconds: 600, message: "Te veel aanvragen. Probeer het later opnieuw." });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    const email = parsed.success ? schoonTesterAdres(parsed.data.email) : null;
    if (!email) throw AppError.validation("Vul een geldig e-mailadres in.");
    const nieuw = await voegTesterToe(email);
    if (nieuw) {
      // de melder voor de eigenaar, zonder het adres (alleen dat er iemand bij is)
      void import("@/lib/ops/melder")
        .then(({ meldGebeurtenis }) => meldGebeurtenis({ soort: "overig", belang: "samenvatting", titel: "Nieuwe tester voor de Android-app", url: "/admin/google-play" }))
        .catch(() => undefined);
    }
    return NextResponse.json({ ok: true, nieuw });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("app tester aanvraag mislukt", { error: (err as Error).message });
    return res;
  }
}
