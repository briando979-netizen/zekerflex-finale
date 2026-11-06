import { NextResponse } from "next/server";
import { runHealthCheck, type HealthCheck } from "@/lib/ops/health-check";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const check = await runHealthCheck();
    return NextResponse.json(check);
  } catch (err) {
    return NextResponse.json({ status: "critical", error: (err as Error).message }, { status: 503 });
  }
}
