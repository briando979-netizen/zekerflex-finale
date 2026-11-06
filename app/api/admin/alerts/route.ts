import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { listRules, addRule, toggleRule, deleteRule } from "@/lib/alerts/rules";

export async function GET(request: NextRequest) {
  const p = await getPrincipal();
  if (!p || !hasRole(p, "PLATFORM_ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listRules());
}

export async function POST(request: NextRequest) {
  const p = await getPrincipal();
  if (!p || !hasRole(p, "PLATFORM_ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { action, id, name, type, threshold, window_minutes } = await request.json();

  if (action === "add") {
    return NextResponse.json(await addRule({ name, enabled: true, type, threshold, window_minutes }));
  } else if (action === "toggle") {
    await toggleRule(id);
    return NextResponse.json({ ok: true });
  } else if (action === "delete") {
    await deleteRule(id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
