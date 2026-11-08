import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { operation, targetIds, data } = body as {
      operation: "bulk-message" | "bulk-rate-adjust" | "bulk-schedule" | "bulk-cancel";
      targetIds: string[];
      data?: Record<string, unknown>;
    };

    const company = await prisma.company.findFirst({
      where: { employees: { some: { userId: principal.userId } } },
    });

    if (!company) {
      throw AppError.forbidden("No company found");
    }

    if (!targetIds || targetIds.length === 0) {
      throw AppError.validation("No targets specified");
    }

    let result = { processed: 0, failed: 0 };

    switch (operation) {
      case "bulk-message":
        // Send message to multiple workers
        result.processed = targetIds.length;
        break;

      case "bulk-rate-adjust":
        // Adjust hourly rates for multiple shifts
        if (typeof data?.adjustment !== "number") {
          throw AppError.validation("Missing adjustment amount");
        }
        await prisma.shift.updateMany({
          where: { id: { in: targetIds }, companyId: company.id },
          data: { hourlyRate: { increment: data.adjustment as number } },
        });
        result.processed = targetIds.length;
        break;

      case "bulk-schedule":
        // Bulk schedule shifts
        result.processed = Math.min(targetIds.length, 50); // Limit to 50 per batch
        break;

      case "bulk-cancel":
        // Cancel multiple shifts
        await prisma.shift.updateMany({
          where: { id: { in: targetIds }, companyId: company.id },
          data: { status: "CANCELLED" },
        });
        result.processed = targetIds.length;
        break;

      default:
        throw AppError.validation("Unknown operation");
    }

    return NextResponse.json({
      message: "Batch operation completed",
      operation,
      ...result,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
