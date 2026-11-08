import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const reportType = request.nextUrl.searchParams.get("type") || "summary";
    const maand = request.nextUrl.searchParams.get("maand");
    const jaar = request.nextUrl.searchParams.get("jaar");

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    let report: any = {};

    if (reportType === "summary") {
      report = await generateSummaryReport(tenant.id);
    } else if (reportType === "monthly" && maand && jaar) {
      report = await generateMonthlyReport(tenant.id, parseInt(maand), parseInt(jaar));
    } else if (reportType === "customer") {
      report = await generateCustomerReport(tenant.id);
    } else if (reportType === "product") {
      report = await generateProductReport(tenant.id);
    }

    return NextResponse.json({ report, type: reportType });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

async function generateSummaryReport(tenantId: string) {
  const [bookings, revenue, customers] = await Promise.all([
    prisma.booking.count({ where: { tenantId } }),
    prisma.booking.aggregate({
      where: { tenantId, status: { in: ["COMPLETED", "CONFIRMED"] } },
      _sum: { bedragCent: true },
    }),
    prisma.customer.count({ where: { tenantId } }),
  ]);

  return {
    totalBookings: bookings,
    totalRevenue: Math.round((revenue._sum.bedragCent || 0) / 100),
    totalCustomers: customers,
    averageBookingValue: bookings > 0 ? Math.round(((revenue._sum.bedragCent || 0) / bookings) / 100) : 0,
  };
}

async function generateMonthlyReport(tenantId: string, maand: number, jaar: number) {
  const maandStart = new Date(jaar, maand - 1, 1);
  const maandEinde = new Date(jaar, maand, 1);

  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      datumTijd: { gte: maandStart, lt: maandEinde },
    },
  });

  const revenue = bookings.reduce((sum, b) => sum + (b.bedragCent || 0), 0);

  return {
    maand,
    jaar,
    bookings: bookings.length,
    revenue: Math.round(revenue / 100),
    bookingsByDay: groupByDay(bookings),
  };
}

async function generateCustomerReport(tenantId: string) {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    take: 100,
  });

  return {
    totalCustomers: customers.length,
    customersByCity: groupByCity(customers),
  };
}

async function generateProductReport(tenantId: string) {
  const bookings = await prisma.booking.groupBy({
    by: ["productId"],
    where: { tenantId },
    _count: { id: true },
    _sum: { bedragCent: true },
  });

  return {
    totalProducts: bookings.length,
    topProducts: bookings.slice(0, 5),
  };
}

function groupByDay(bookings: any[]) {
  const grouped: Record<string, number> = {};
  for (const booking of bookings) {
    const date = booking.datumTijd.toISOString().split("T")[0];
    grouped[date] = (grouped[date] || 0) + 1;
  }
  return grouped;
}

function groupByCity(customers: any[]) {
  const grouped: Record<string, number> = {};
  for (const customer of customers) {
    if (customer.stad) {
      grouped[customer.stad] = (grouped[customer.stad] || 0) + 1;
    }
  }
  return grouped;
}
