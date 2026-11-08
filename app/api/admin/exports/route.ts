import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const type = request.nextUrl.searchParams.get("type") || "summary";
    const format = request.nextUrl.searchParams.get("format") || "json";

    let data: any = {};

    if (type === "summary") {
      data = await generateSummaryExport();
    } else if (type === "users") {
      data = await generateUsersExport();
    } else if (type === "transactions") {
      data = await generateTransactionsExport();
    } else if (type === "compliance") {
      data = await generateComplianceExport();
    }

    if (format === "csv") {
      return new NextResponse(convertToCSV(data), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="export.csv"',
        },
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

async function generateSummaryExport() {
  const [userCount, tenantCount, bookingCount, revenue] = await Promise.all([
    prisma.user.count(),
    prisma.tenant.count(),
    prisma.booking.count(),
    prisma.booking.aggregate({
      _sum: { bedragCent: true },
    }),
  ]);

  return {
    exportDate: new Date(),
    summary: {
      totalUsers: userCount,
      totalTenants: tenantCount,
      totalBookings: bookingCount,
      totalRevenue: Math.round((revenue._sum.bedragCent || 0) / 100),
    },
  };
}

async function generateUsersExport() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
    take: 10000,
  });

  return { users };
}

async function generateTransactionsExport() {
  const bookings = await prisma.booking.findMany({
    select: {
      id: true,
      klantEmail: true,
      bedragCent: true,
      datumTijd: true,
      status: true,
    },
    take: 10000,
  });

  return { transactions: bookings };
}

async function generateComplianceExport() {
  const logs = await prisma.auditLog.findMany({
    take: 1000,
  });

  return { auditTrail: logs };
}

function convertToCSV(data: any): string {
  if (!data.users && !data.transactions) {
    return JSON.stringify(data);
  }

  const rows: string[] = [];
  const arr = data.users || data.transactions || [];

  if (arr.length > 0) {
    const headers = Object.keys(arr[0]);
    rows.push(headers.join(","));

    for (const item of arr) {
      rows.push(headers.map((h) => item[h]).join(","));
    }
  }

  return rows.join("\n");
}
