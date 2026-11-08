import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as crmContacts from "@/lib/crm/contacts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const search = request.nextUrl.searchParams.get("search") || undefined;

    const contacts = await crmContacts.listContacts(principal.tenantId, search);
    return NextResponse.json({ contacts });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const contact = await crmContacts.createContact(
      principal.tenantId,
      principal.userId,
      body
    );

    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
