import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { birthdayValue, getUserBirthday, setUserBirthday } from "@/lib/seasons/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/verjaardag — my birthday ("MM-DD") or null. Optional, day and month only:
// on that day ZekerFlex celebrates with you (lib/seasons).
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ verjaardag: await getUserBirthday(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ maand: z.number().int().nullable(), dag: z.number().int().nullable() });

// POST { maand, dag } — set it, or both null to remove it.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { maand, dag } = schema.parse(await request.json().catch(() => ({})));
    if (maand === null || dag === null) {
      await setUserBirthday(p.userId, null);
      return NextResponse.json({ verjaardag: null });
    }
    const value = birthdayValue(maand, dag);
    if (!value) throw AppError.validation("Die datum bestaat niet. Kies een dag die in die maand voorkomt.");
    await setUserBirthday(p.userId, value);
    return NextResponse.json({ verjaardag: value });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
