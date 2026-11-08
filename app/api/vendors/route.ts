import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { createVendor, listVendors, updateVendor, getVendor } from "@/lib/vendors";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const vendorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  country: z.string(),
  taxId: z.string(),
  paymentTerms: z.enum(["NET30", "NET60", "NET90", "IMMEDIATE"]),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole("PROCUREMENT_MANAGER");
    const status = request.nextUrl.searchParams.get("status");
    const vendors = await listVendors(status || undefined);
    return NextResponse.json({ vendors });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("PROCUREMENT_MANAGER");
    const body = await request.json();
    const vendor = vendorSchema.parse(body);
    const created = await createVendor(vendor);
    return NextResponse.json({ vendor: created }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole("PROCUREMENT_MANAGER");
    const vendorId = request.nextUrl.searchParams.get("id");
    if (!vendorId) throw AppError.validation("Vendor ID required");

    const body = await request.json();
    const updated = await updateVendor(vendorId, body);
    return NextResponse.json({ vendor: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
