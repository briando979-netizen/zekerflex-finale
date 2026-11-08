import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getLists, createList, addSubscriber, getSubscribers } from "@/lib/email/lists";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const listId = request.nextUrl.searchParams.get("listId");

    if (!tenantId) {
      throw AppError.validation("tenantId required");
    }

    if (listId) {
      const subscribers = await getSubscribers(tenantId, listId);
      return NextResponse.json({ subscribers });
    }

    const lists = await getLists(tenantId);
    return NextResponse.json({ lists });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const tenantId = body.tenantId;
    const listId = body.listId;

    if (!tenantId) {
      throw AppError.validation("tenantId required");
    }

    // Create new list
    if (!listId) {
      const list = await createList(tenantId, body);
      return NextResponse.json({ list }, { status: 201 });
    }

    // Add subscriber to list
    const subscriber = await addSubscriber(tenantId, listId, body);
    return NextResponse.json({ subscriber }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
