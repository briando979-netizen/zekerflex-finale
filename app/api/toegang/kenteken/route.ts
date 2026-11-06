import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { BESLUIT_TEKST, geldigKenteken, toonKenteken } from "@/lib/locatie/modules";
import { kastjeGezien, verwerkAankomst, vestigingVanToken } from "@/lib/locatie/toegang";
import { bedrijfsnaam, locatieStand } from "@/lib/locatie/store";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Het kastje bij de slagboom (deploy/toegang) las een kenteken en vraagt: mag
// deze auto nu het terrein op? Alleen met het token van de vestiging
// (header x-toegang-token; lib/locatie/toegang.ts), daarom in de lijst van
// openbare routes met eigen sleutelcontrole. Het kastje zet zelf de slagboom
// open met het antwoord; wij loggen en melden.
//   POST { kenteken, camera? }  → { ok, open, seconden, naam?, reden, tekst, kenteken }
//   GET                         → { ok, bedrijf, vestiging }  (controle of het token werkt)
// ---------------------------------------------------------------------------

const schema = z.object({
  kenteken: z.string().min(2).max(20),
  camera: z.string().max(60).optional(),
  apparaat: z.string().max(60).optional(),
});

function tokenUit(request: Request): string | null {
  const h = request.headers.get("x-toegang-token");
  if (h) return h.trim();
  const auth = request.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

async function kastje(request: Request) {
  await enforceRateLimit({ name: "toegang-kenteken", identifier: clientIp(request), limit: 240, windowSeconds: 60, message: "Te veel aanvragen van dit kastje; even wachten." });
  const hit = await vestigingVanToken(tokenUit(request));
  if (!hit) return null;
  const stand = await locatieStand(hit.tenantId);
  return { ...hit, moduleAan: Boolean(stand.modules.toegang?.aan) };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const k = await kastje(request);
    if (!k) return NextResponse.json({ ok: false, reden: "token-onbekend", tekst: "Dit token is niet (meer) geldig. Maak een nieuw token in Werkgever → Op locatie → Toegang." }, { status: 401 });
    const [b, bedrijf] = await Promise.all([prisma.branch.findUnique({ where: { id: k.branchId }, select: { name: true } }), bedrijfsnaam(k.tenantId)]);
    await kastjeGezien(k.tenantId, k.branchId, request.headers.get("x-apparaat"));
    return NextResponse.json({ ok: true, bedrijf, vestiging: b?.name ?? "", moduleAan: k.moduleAan });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const k = await kastje(request);
    if (!k) return NextResponse.json({ ok: false, open: false, reden: "token-onbekend", tekst: "Dit token is niet (meer) geldig." }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, open: false, reden: "ongeldig", tekst: "Stuur { kenteken }." }, { status: 400 });
    if (!geldigKenteken(parsed.data.kenteken)) return NextResponse.json({ ok: true, open: false, reden: "ongeldig", tekst: "Geen leesbaar kenteken." });
    await kastjeGezien(k.tenantId, k.branchId, parsed.data.apparaat ?? request.headers.get("x-apparaat"));
    if (!k.moduleAan) return NextResponse.json({ ok: true, open: false, reden: "module-uit", tekst: "Toegang op kenteken staat uit bij dit bedrijf." }, { status: 403 });

    const { event, openSeconden } = await verwerkAankomst({ tenantId: k.tenantId, branchId: k.branchId, kenteken: parsed.data.kenteken, bron: "camera", camera: parsed.data.camera });
    // geen kenteken in het log: alleen het besluit
    logger.info("toegang op kenteken", { open: event.besluit.open, reden: event.besluit.reden });
    return NextResponse.json({
      ok: true,
      open: event.besluit.open,
      seconden: event.besluit.open ? openSeconden : 0,
      reden: event.besluit.reden,
      tekst: BESLUIT_TEKST[event.besluit.reden],
      kenteken: toonKenteken(event.kenteken),
      ...(event.besluit.naam ? { naam: event.besluit.naam } : {}),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
