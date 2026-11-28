import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { MAX_BYTES, MAX_DAGEN, kiesOpruiming, uitOmgeving, type CacheBestand } from "@/lib/ops/plaatjescache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (elke maandag 03:50, deploy/cron/entrypoint.sh): de plaatjescache van Next opruimen. Next bewaart elke geoptimaliseerde
// afbeelding voor altijd; op 28 nov 2026 was dat 4,2 GB in 83.213 bestanden. De regels staan in lib/ops/plaatjescache.ts.
// Met ?droog=1 rekent hij alleen uit wat weg zou gaan en haalt hij niets weg. Eigen shared-secret auth.

/** Waar de cache staat. In de container is dat /app/.next/cache/images (volume next-cache). */
function cacheMap(): string {
  return process.env["NEXT_PLAATJESCACHE_DIR"] ?? join(process.cwd(), ".next", "cache", "images");
}

/** Alle bestanden in de cache, met grootte en tijd. Een map die verdwijnt tijdens het lezen slaan we over. */
async function lees(map: string): Promise<CacheBestand[]> {
  const uit: CacheBestand[] = [];
  let namen: string[];
  try {
    namen = await readdir(map);
  } catch {
    return uit;
  }
  for (const naam of namen) {
    const pad = join(map, naam);
    try {
      const s = await stat(pad);
      if (s.isDirectory()) {
        uit.push(...(await lees(pad)));
      } else if (s.isFile()) {
        uit.push({ pad, bytes: s.size, gewijzigd: s.mtimeMs });
      }
    } catch {
      // net weggehaald of geen toegang: overslaan
    }
  }
  return uit;
}

async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  const droog = new URL(request.url).searchParams.get("droog") === "1";
  try {
    const map = cacheMap();
    const bestanden = await lees(map);
    const keuze = kiesOpruiming(
      bestanden,
      Date.now(),
      uitOmgeving(process.env["NEXT_PLAATJESCACHE_DAGEN"], MAX_DAGEN),
      uitOmgeving(process.env["NEXT_PLAATJESCACHE_BYTES"], MAX_BYTES),
    );

    let weg = 0;
    if (!droog) {
      for (const pad of keuze.weg) {
        try {
          await rm(pad, { force: true });
          weg += 1;
        } catch {
          // blijft staan; de volgende ronde probeert het opnieuw
        }
      }
    }

    recordCronRun("onderhoud-plaatjescache", true);
    return NextResponse.json({
      droog,
      gevonden: bestanden.length,
      weg: droog ? keuze.weg.length : weg,
      mbWeg: Math.round(keuze.bytesWeg / 1048576),
      mbOver: Math.round(keuze.bytesOver / 1048576),
      teOud: keuze.teOud,
      teGroot: keuze.teGroot,
    });
  } catch (err) {
    recordCronRun("onderhoud-plaatjescache", false);
    logger.error("onderhoud-plaatjescache mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Opruimen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
