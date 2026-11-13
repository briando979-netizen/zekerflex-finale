import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { standaardShopIndeling } from "@/lib/ontwerp/shop-indeling";
import { getShopIndeling, resetShopIndeling, setShopIndeling } from "@/lib/ontwerp/shop-indeling-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De indeling van de webshop (Site-ontwerper, tabblad Webshop): welke onderdelen onder de kop staan en in welke volgorde.

async function antwoord() {
  const eigen = await getShopIndeling();
  return { indeling: eigen ?? standaardShopIndeling(), eigen: Boolean(eigen) };
}

// GET: de indeling zoals hij live staat.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await antwoord()));

const schema = z.object({ indeling: z.object({ volgorde: z.array(z.string().max(40)).max(40), verborgen: z.array(z.string().max(40)).max(40) }) });

// PUT: een eigen indeling live zetten. Gelijk aan de standaard = de eigen versie weg.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Deze indeling kon niet worden gelezen.");
  const eigen = await setShopIndeling(parsed.data.indeling);
  await recordAudit({
    category: "ADMIN",
    action: "ontwerp.shop-indeling",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: eigen ? "Indeling van de webshop bijgewerkt" : "Indeling van de webshop is weer de standaard",
  });
  return NextResponse.json({ indeling: eigen ?? standaardShopIndeling(), eigen: Boolean(eigen) });
});

// DELETE: terug naar de standaard.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request: Request, { principal }) => {
  await resetShopIndeling();
  await recordAudit({ category: "ADMIN", action: "ontwerp.shop-indeling", actorUserId: principal.userId, actorLabel: "user", summary: "Indeling van de webshop terug naar de standaard" });
  return NextResponse.json({ indeling: standaardShopIndeling(), eigen: false });
});
