import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { addCustom, customTodos, ownerTodos, setManualDone, updateCustom } from "@/lib/admin/owner-todos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/todos — the owner's to-do list (auto-checked where possible) + own notes.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [todos, custom] = await Promise.all([ownerTodos(), customTodos()]);
  return NextResponse.json({ todos, custom });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), id: z.string().min(2).max(40), done: z.boolean() }),
  z.object({ action: z.literal("add"), text: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("custom"), id: z.string().min(2).max(20), done: z.boolean().optional(), remove: z.boolean().optional() }),
]);

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  if (input.action === "toggle") await setManualDone(input.id, input.done, principal.fullName);
  else if (input.action === "add") await addCustom(input.text);
  else await updateCustom(input.id, { done: input.done, remove: input.remove });
  const [todos, custom] = await Promise.all([ownerTodos(), customTodos()]);
  return NextResponse.json({ todos, custom });
});
