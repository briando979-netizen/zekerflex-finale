import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { addDismissed, notifSignature } from "@/lib/notifications/dismissed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/notifications/dismiss { items: [{ id, body }] }
// Markeert meldingen als gelezen (server-side, over apparaten heen).
const schema = z.object({
  items: z
    .array(z.object({ id: z.string().min(1).max(200), body: z.string().max(2000) }))
    .min(1)
    .max(50),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { items } = schema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );
    await addDismissed(
      p.userId,
      items.map((i) => notifSignature(i.id, i.body)),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
