import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { lees } from "@/lib/rijschool/schema";
import { eisBeheer } from "@/lib/rijschool/toegang";
import { heldfotoUrl, verwijderHeldfoto, zetHeldfoto } from "@/lib/rijschool/heldfoto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

// GET — de huidige foto bovenaan de website (of null).
export async function GET(): Promise<NextResponse> {
  try {
    const { rijschool } = await eisBeheer();
    return NextResponse.json({ url: await heldfotoUrl(rijschool) });
  } catch (err) {
    return fout(err);
  }
}

const schema = z.object({ foto: z.string().min(100).max(21_000_000) });

// POST { foto: data-adres of base64 } — een nieuwe foto (vervangt de oude).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { p, rijschool } = await eisBeheer();
    const { foto } = lees(schema, await request.json().catch(() => ({})));
    const bytes = Buffer.from(foto.replace(/^data:[^,]*,/, ""), "base64");
    if (bytes.length < 1000) throw AppError.validation("Dit is geen foto.");
    await zetHeldfoto(rijschool, bytes, p.userId);
    return NextResponse.json({ url: await heldfotoUrl(rijschool) });
  } catch (err) {
    return fout(err);
  }
}

// DELETE — geen foto meer (de site toont dan alleen het verloop).
export async function DELETE(): Promise<NextResponse> {
  try {
    const { rijschool } = await eisBeheer();
    await verwijderHeldfoto(rijschool);
    return NextResponse.json({ url: null });
  } catch (err) {
    return fout(err);
  }
}
