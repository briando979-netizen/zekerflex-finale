import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { chat, llmConfigProblem } from "@/lib/ai/client";
import { getSpecialist, SPECIALISTS } from "@/lib/ai/specialists";
import { kvAppend, kvGet } from "@/lib/storage/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface LogItem {
  at: string;
  by: string;
  input: string;
  answer: string;
  mode: "model" | "offline";
}

// GET /api/admin/specialists[?id=jurist] — the specialists, or one's recent questions.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (id) return NextResponse.json({ log: ((await kvGet<LogItem[]>(`specialist-log:${id}`)) ?? []).slice(-20).reverse() });
  return NextResponse.json({
    modelConnected: !llmConfigProblem(),
    specialists: SPECIALISTS.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, role: s.role, placeholder: s.placeholder, offline: Boolean(s.offline) })),
  });
});

const schema = z.object({ id: z.string().min(2).max(30), input: z.string().trim().min(3).max(20_000) });

// POST /api/admin/specialists — ask a specialist. Rule/data part always; the model writes the full advice when connected.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { id, input } = schema.parse(await request.json().catch(() => ({})));
  const spec = getSpecialist(id);
  if (!spec) throw AppError.notFound("Onbekende specialist");
  const facts = spec.offline ? await spec.offline(input).catch(() => null) : null;
  let answer: string;
  let mode: LogItem["mode"] = "offline";
  if (llmConfigProblem()) {
    answer =
      facts ??
      `${spec.emoji} ${spec.name} heeft het taalmodel nodig, en dat is nog niet gekoppeld aan de live omgeving. Draai deploy/ai-node/setup.sh op je eigen server en zet de waarden in Vercel; daarna antwoordt deze specialist volledig.`;
  } else {
    try {
      const res = await chat({
        purpose: `specialist-${spec.id}`,
        temperature: 0.2,
        maxTokens: 1200,
        timeoutMs: 90_000,
        retry: false,
        messages: [
          { role: "system", content: spec.system },
          ...(facts ? [{ role: "system" as const, content: `Feiten en controles uit de ZekerFlex-systemen (gebruik deze, verzin niets erbij):\n${facts}` }] : []),
          { role: "user", content: input },
        ],
      });
      answer = res.text.trim() || facts || "Geen antwoord ontvangen.";
      mode = "model";
    } catch (err) {
      answer = `${facts ?? ""}\n\n_Het taalmodel gaf geen antwoord (${(err as Error).message}); hierboven de controle uit de eigen systemen._`.trim();
    }
  }
  await kvAppend<LogItem>(`specialist-log:${spec.id}`, { at: new Date().toISOString(), by: principal.fullName, input: input.slice(0, 2000), answer: answer.slice(0, 8000), mode }, 50);
  return NextResponse.json({ answer, mode });
});
