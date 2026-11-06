import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const p = await getPrincipal();
  if (!p || !hasRole(p, "PLATFORM_ADMIN")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, createdAt: true, type: true, kvkNumber: true },
    orderBy: { createdAt: "desc" },
  });

  let csv = "ID,Naam,Slug,Type,KVK,Gemaakt\n";
  for (const t of tenants) {
    csv += `"${t.id}","${(t.name || "").replace(/"/g, '""')}","${t.slug}","${t.type || ""}","${t.kvkNumber || ""}","${t.createdAt.toISOString()}"\n`;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bedrijven-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
