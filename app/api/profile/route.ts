import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { getUserProfileExtra, saveUserProfileExtra } from "@/lib/profile/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ profile: await getUserProfileExtra(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ headline: z.string().max(120).optional() });

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = schema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const profile = await saveUserProfileExtra(p.userId, {
      ...(input.headline !== undefined ? { headline: input.headline } : {}),
    });
    return NextResponse.json({ profile });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
