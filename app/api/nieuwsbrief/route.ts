import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { normalizeEmail, subscribe } from "@/lib/newsletter/store";
import { newsletterConfirmEmail } from "@/lib/newsletter/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().min(3).max(254),
  consent: z.boolean().refine((v) => v === true, "Toestemming is verplicht."),
  source: z.string().max(40).optional(),
});

// POST /api/nieuwsbrief — public double opt-in signup. Never touches DB/Redis.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "nieuwsbrief",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel aanmeldingen — probeer het later opnieuw.",
    });

    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Controleer je invoer", parsed.error.flatten());
    }
    const email = normalizeEmail(parsed.data.email);
    if (!email) throw AppError.validation("Ongeldig e-mailadres");

    const res = await subscribe(email, parsed.data.source ?? "web");

    // Already confirmed → say so, send nothing. Otherwise send the opt-in mail.
    if (res.status !== "already-confirmed") {
      await sendMail(newsletterConfirmEmail(email, res.subscriber.token)).catch((e) =>
        logger.warn("newsletter confirm mail failed", { error: (e as Error).message }),
      );
    }

    return NextResponse.json({
      ok: true,
      alreadySubscribed: res.status === "already-confirmed",
    });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("newsletter signup failed", { error: (err as Error).message });
    return res;
  }
}
