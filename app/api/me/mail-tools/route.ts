import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getMailTools, setMailTools } from "@/lib/mail/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  signature: z.string().max(1000),
  appendSignature: z.boolean(),
  templates: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(60), subject: z.string().max(200), body: z.string().max(10_000) })).max(50),
});

// GET/PUT /api/me/mail-tools — the caller's mail templates and signature.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ ...(await getMailTools(p.userId)), me: p.fullName });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json(await setMailTools(p.userId, schema.parse(await request.json().catch(() => ({})))));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
