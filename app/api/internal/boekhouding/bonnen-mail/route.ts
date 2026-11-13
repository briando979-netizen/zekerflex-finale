import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { featureEnabled } from "@/lib/flags";
import { checkInternalToken } from "@/lib/internal-auth";
import { imapConfig } from "@/lib/mail";
import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/metrics";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { leesPostvakVoorBonnetjes } from "@/lib/boekhouding/bonnen/mail";
import { authservLijst } from "@/lib/boekhouding/bonnen/mail-kern";
import { BONNEN_MAIL_FLAG, BONNEN_MAIL_JOB, draaiBonnenMail } from "@/lib/boekhouding/bonnen/mail-taak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Elke 10 minuten (deploy/cron/entrypoint.sh): nieuwe mail in de Postvak langslopen en bonnetjes (bonnetjes@) verwerken.
// Standaard uit (flag "boekhouding-bonnen-mail"); dan doet hij niets en blijft alleen de hartslag staan. Begrensd in tijd
// en aantal mails (lib/boekhouding/bonnen/mail-taak.ts). Fouten komen in het foutenlogboek, zonder adressen of inhoud.
// Een melding over een ontbrekende inrichting hooguit één keer per (Amsterdamse) dag; bij een fout in de opslag: wel melden.
async function eenmaalPerDag(sleutel: string): Promise<boolean> {
  try {
    const dag = amsterdamDayKey(new Date());
    const k = `bonnen-mail-ruis:${sleutel}`;
    if ((await kvGet<{ dag: string }>(k))?.dag === dag) return false;
    await kvSet(k, { dag });
    return true;
  } catch {
    return true;
  }
}

async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });

  let uitkomst: Awaited<ReturnType<typeof draaiBonnenMail>>;
  try {
    uitkomst = await draaiBonnenMail({
    flagAan: () => featureEnabled(BONNEN_MAIL_FLAG),
    imapConfig,
    administratieId: async () => {
      const a = await prisma.boekAdministratie.findFirst({ where: { soort: "ECHT", actief: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      return a?.id ?? null;
    },
    lees: (cfg, administratieId, opties) => leesPostvakVoorBonnetjes(cfg, administratieId, opties),
    vertrouwdeServers: authservLijst(env.BONNEN_AUTHSERV_ID),
    eenmaalPerDag,
    });
  } catch (e) {
    // bv. de database of de vlag-opslag is weg: niet stil falen
    logger.error("bonnetjesmail: de taak is vastgelopen", { soort: e instanceof Error ? e.name : "onbekend" });
    recordCronRun(BONNEN_MAIL_JOB, false);
    return NextResponse.json({ error: { code: "INTERNAL", message: "De verwerking van bonnetjesmail is mislukt." } }, { status: 500 });
  }

  // "uit" en "niet-ingericht" tellen als een geslaagde run: de taak draait, hij hoeft alleen niets te doen. Een
  // inrichtingsfout is geen storing (anders slaat de hartslagbewaking alarm); de eigenaar ziet hem als taak in Te doen.
  const ok = uitkomst.status === "uit" || uitkomst.status === "gelukt" || uitkomst.status === "niet-ingericht";
  recordCronRun(BONNEN_MAIL_JOB, ok);
  return NextResponse.json({ status: uitkomst.status, ...(uitkomst.status === "gelukt" ? { uitslag: uitkomst.uitslag } : {}) }, { status: ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
