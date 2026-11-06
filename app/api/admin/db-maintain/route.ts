import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const p = await getPrincipal();
  if (!p || !hasRole(p, "PLATFORM_ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action } = await request.json().catch(() => ({}));

  try {
    let result = "";
    if (action === "vacuum") {
      await prisma.$executeRawUnsafe("VACUUM ANALYZE;");
      result = "VACUUM ANALYZE gereed";
    } else if (action === "analyze") {
      await prisma.$executeRawUnsafe("ANALYZE;");
      result = "ANALYZE gereed";
    } else {
      const sz = await prisma.$queryRaw<Array<{ size: string }>>`SELECT pg_size_pretty(pg_database_size(current_database())) as size;`;
      result = "DB: " + (sz[0]?.size || "?");
    }
    logger.info("db-maintain", { action, result });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    logger.error("db-maintain fout", { error: (err as Error).message });
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
