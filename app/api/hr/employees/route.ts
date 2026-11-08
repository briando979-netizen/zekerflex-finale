import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import * as employees from "@/lib/hr/employees";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("HQ_ADMIN");
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) throw new Error("tenantId required");

    const emps = await employees.getEmployees(tenantId);
    return NextResponse.json({ employees: emps });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("HQ_ADMIN");
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) throw new Error("tenantId required");

    const data = await request.json();
    const emp = await employees.createEmployee(tenantId, data);
    return NextResponse.json(emp, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
