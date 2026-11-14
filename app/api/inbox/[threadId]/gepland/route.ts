import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { blockedBetween } from "@/lib/messaging/thread-prefs";
import { BERICHT_MAX } from "@/lib/chat/lange-tekst";
import { annuleerGepland, geplandIn, planBericht } from "@/lib/messaging/gepland";
import { geplandeTijd, GEPLAND_MAX_DAGEN, GEPLAND_MAX_PER_PERSOON } from "@/lib/messaging/gepland-tijd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Later versturen in een gesprek (lib/messaging/gepland.ts). Alleen je eigen geplande berichten:
//   GET                    → { gepland: [...] } in dit gesprek, eerst wat het eerst gaat
//   POST { text, wanneer } → inplannen; wanneer is Nederlandse tijd (datetime-local) → { gepland }
//   DELETE ?id=<id>        → niet versturen → { ok }
// De cron (/api/internal/chat/gepland) verstuurt elke minuut wat aan de beurt is.

const schema = z.object({ text: z.string().trim().min(1).max(BERICHT_MAX), wanneer: z.string().max(20) });

async function toegang(threadId: string) {
  const p = await requirePrincipal();
  const thread = await getThread(threadId);
  if (!thread || !canAccess(thread, p.userId, await isPlatformAdmin(p.userId))) return null;
  return { p, thread };
}

const nietGevonden = () => NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });

export async function GET(_req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  try {
    const t = await toegang((await props.params).threadId);
    if (!t) return nietGevonden();
    return NextResponse.json({ gepland: await geplandIn(t.p.userId, t.thread.id) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  try {
    const t = await toegang((await props.params).threadId);
    if (!t) return nietGevonden();
    // inplannen mag alleen wie nu ook mag sturen: deelnemer, en niet geblokkeerd
    if (!t.thread.participants.includes(t.p.userId)) throw AppError.validation("Je kunt in dit gesprek geen berichten inplannen.");
    const ander = t.thread.kind === "direct" ? t.thread.participants.find((id) => id !== t.p.userId) : undefined;
    if (ander && (await blockedBetween(t.p.userId, ander))) throw AppError.validation("Je kunt deze persoon geen berichten sturen.");
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) throw AppError.validation("Typ een bericht en kies een tijd.");
    const sendAt = geplandeTijd(body.data.wanneer);
    if (!sendAt) throw AppError.validation(`Kies een tijd vanaf over een minuut tot over ${GEPLAND_MAX_DAGEN} dagen.`);
    const gepland = await planBericht(t.p.userId, t.thread.id, body.data.text, sendAt);
    if (!gepland) throw AppError.validation(`Je hebt al ${GEPLAND_MAX_PER_PERSOON} berichten ingepland. Wacht tot er een verstuurd is.`);
    return NextResponse.json({ gepland }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  try {
    const t = await toegang((await props.params).threadId);
    if (!t) return nietGevonden();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(id)) throw AppError.validation("Onbekend gepland bericht");
    // alleen je eigen (de sleutel draagt je userId); al verstuurd of weg: 404
    if (!(await annuleerGepland(t.p.userId, id))) throw AppError.notFound("Dit bericht is al verstuurd of bestaat niet meer.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
