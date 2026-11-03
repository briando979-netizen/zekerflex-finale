import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorBody } from "@/lib/errors";
import { lees } from "@/lib/rijschool/schema";
import { eisBeheer } from "@/lib/rijschool/toegang";
import { IDEAL_KOSTEN_CENT, koppelStripe, stripeDashboard, stripeStand } from "@/lib/rijschool/betalen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

// GET — kan de rijschool online betalingen ontvangen (vers bij Stripe nagevraagd)?
export async function GET(): Promise<NextResponse> {
  try {
    const { rijschool } = await eisBeheer();
    return NextResponse.json({ ...(await stripeStand(rijschool, true)), kostenCent: IDEAL_KOSTEN_CENT });
  } catch (err) {
    return fout(err);
  }
}

const schema = z.object({ actie: z.enum(["koppelen", "dashboard"]) });

// POST — { actie: "koppelen" } geeft de link om het Stripe-account in te vullen,
// { actie: "dashboard" } de link naar het eigen Stripe-dashboard (uitbetalingen).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { rijschool } = await eisBeheer();
    const { actie } = lees(schema, await request.json().catch(() => ({})));
    return NextResponse.json({ url: actie === "koppelen" ? await koppelStripe(rijschool) : await stripeDashboard(rijschool) });
  } catch (err) {
    return fout(err);
  }
}
