import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http/errors";
import { eisBeheerder } from "@/lib/voorstel/schwarzwald-accounts";
import { dashboardCijfers } from "@/lib/voorstel/schwarzwald-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alle cijfers voor het beheer-dashboard in één keer.
export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    return NextResponse.json(await dashboardCijfers());
  } catch (err) {
    return jsonError(err);
  }
}
