import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  format: z.enum(["csv", "json", "parquet"]),
  includeShifts: z.boolean().optional(),
  includeInvoices: z.boolean().optional(),
  includeMessages: z.boolean().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { format, includeShifts, includeInvoices, includeMessages } = exportSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
    });

    if (!user) {
      throw AppError.notFound("User not found");
    }

    const exportData: Record<string, unknown> = {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    };

    if (includeShifts) {
      exportData.shifts = await prisma.freelancerShift.findMany({
        where: { freelancerId: user.id },
      });
    }

    if (includeInvoices) {
      exportData.invoices = await prisma.invoice.findMany({
        where: { userId: user.id },
      });
    }

    if (includeMessages) {
      exportData.messages = await prisma.message.findMany({
        where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
        select: { id: true, content: true, createdAt: true, senderId: true },
      });
    }

    let output: string | Buffer;

    if (format === "json") {
      output = JSON.stringify(exportData, null, 2);
    } else if (format === "csv") {
      output = convertToCSV(exportData);
    } else if (format === "parquet") {
      output = Buffer.from(JSON.stringify(exportData), "utf-8");
    }

    const filename = `export-${user.id}-${new Date().toISOString()}.${format}`;

    return new NextResponse(output, {
      status: 200,
      headers: {
        "Content-Type": format === "json" ? "application/json" : format === "csv" ? "text/csv" : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

function convertToCSV(data: Record<string, unknown>): string {
  const rows: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && Array.isArray(value)) {
      const headers = Object.keys(value[0] || {});
      rows.push(headers.join(","));
      for (const item of value) {
        rows.push(
          headers
            .map((h) => {
              const v = (item as Record<string, unknown>)[h];
              return typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : String(v ?? "");
            })
            .join(",")
        );
      }
    }
  }

  return rows.join("\n");
}
