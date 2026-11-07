import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal, hasRole } from "@/lib/auth";
import { createFinancialConnectionsSession } from "@/lib/billing/financial-connections";

const startSchema = z.object({
  userType: z.enum(["freelancer", "employer"]),
});

export async function POST(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const body = await request.json();
    const { userType } = startSchema.parse(body);

    // Verify user type matches
    if (userType === "employer" && !hasRole(p, "HQ_ADMIN")) {
      return NextResponse.json({ error: "Alleen beheerders kunnen een werkgeversrekening koppelen" }, { status: 403 });
    }
    if (userType === "freelancer" && !hasRole(p, "FREELANCER")) {
      return NextResponse.json({ error: "Alleen flexwerkers kunnen een persoonsrekening koppelen" }, { status: 403 });
    }

    const session = await createFinancialConnectionsSession({
      userId: p.userId,
      userType,
      email: p.email,
    });

    return NextResponse.json(session);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Ongeldige gegevens" }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
