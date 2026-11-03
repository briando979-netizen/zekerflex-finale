import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { currentYear, getMileageLog, mileageCsv, setTripOverride } from "@/lib/worker/mileage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function yearFrom(url: URL): number {
  const y = Number(url.searchParams.get("jaar"));
  const now = currentYear();
  return Number.isInteger(y) && y >= 2020 && y <= now ? y : now;
}

// GET /api/me/ritten?jaar=2026[&format=csv] — my trips to my shifts that year, or the CSV for the accountant.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const url = new URL(request.url);
    const log = await getMileageLog(p.userId, yearFrom(url));
    if (!log) throw AppError.notFound("Je hebt nog geen profiel als professional");
    if (url.searchParams.get("format") === "csv") {
      return new NextResponse(mileageCsv(log), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="zekerflex-ritten-${log.year}.csv"` },
      });
    }
    return NextResponse.json(log);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({
  timesheetId: z.string().min(1).max(64),
  km: z.number().nullable().optional(),
  excluded: z.boolean().optional(),
});

// PATCH { timesheetId, km?, excluded? } — my own km for one trip (null = back to the estimate), or leave it out.
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { timesheetId, km, excluded } = schema.parse(await request.json().catch(() => ({})));
    await setTripOverride(p.userId, timesheetId, {
      ...(km !== undefined ? { km } : {}),
      ...(excluded !== undefined ? { excluded } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
