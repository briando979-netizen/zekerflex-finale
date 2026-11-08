import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createTemplate, getTemplates, useTemplate, deleteTemplate } from "@/lib/chat/templates";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { title, content } = await request.json();

    const template = await createTemplate(principal.userId, title, content);
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const templates = await getTemplates(principal.userId);
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const templateId = request.nextUrl.searchParams.get("templateId");
    await useTemplate(templateId || "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const templateId = request.nextUrl.searchParams.get("templateId");
    await deleteTemplate(templateId || "");
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
