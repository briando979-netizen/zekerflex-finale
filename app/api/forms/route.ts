import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createForm, listForms } from "@/lib/forms/builder";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateFormSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(z.object({
    id: z.string(),
    name: z.string(),
    label: z.string(),
    type: z.string(),
    required: z.boolean().optional(),
    order: z.number(),
  })),
  settings: z.object({
    multiStep: z.boolean().optional(),
    confirmationMessage: z.string().optional(),
  }).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const forms = await listForms(principal.tenantId);
    return NextResponse.json({ forms });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const validated = CreateFormSchema.parse(body);

    const form = await createForm(principal.tenantId, validated);
    return NextResponse.json({ form }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
