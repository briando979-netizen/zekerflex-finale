import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { clearErrorGroups, flushJournal, listErrorGroups } from "@/lib/ops/error-journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/foutmeldingen — the error journal (lib/ops/error-journal.ts),
// newest first, after writing what this server collected in the last seconds.
// DELETE { ids } or { alles: true } — "opgelost": the groups go, and come back
// as new if the problem happens again.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  await flushJournal();
  return NextResponse.json({ groups: await listErrorGroups(500) });
});

const schema = z.union([z.object({ ids: z.array(z.string().max(40)).min(1).max(500) }), z.object({ alles: z.literal(true) })]);

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  const cleared = await clearErrorGroups("alles" in input ? "alles" : input.ids);
  return NextResponse.json({ cleared });
});
