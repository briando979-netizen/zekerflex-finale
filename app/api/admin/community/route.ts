import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { beheerOverzicht } from "@/lib/community/beheer";
import { wisFotos } from "@/lib/community/fotos";
import { beheerBericht, laatWeerToe, leesOnderwerp, leesReacties, sluitUit, zetInstelling, zetVastgepind } from "@/lib/community/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: gemelde en recente berichten, uitgesloten accounts, de instelling en de cijfers (lib/community/beheer.ts).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await beheerOverzicht()));

const bericht = { onderwerpId: z.string().regex(/^[a-z0-9]{4,32}$/), reactieId: z.string().regex(/^[a-z0-9]{4,32}$/).nullable().default(null) };
const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.enum(["tonen", "verbergen", "verwijderen"]), ...bericht, reden: z.string().max(300).default("") }),
  z.object({ actie: z.enum(["vastpinnen", "losmaken"]), onderwerpId: bericht.onderwerpId }),
  z.object({ actie: z.literal("uitsluiten"), ...bericht, reden: z.string().max(300).default("") }),
  z.object({ actie: z.literal("toelaten"), userId: z.string().min(1).max(64) }),
  z.object({ actie: z.literal("schrijven"), dicht: z.boolean() }),
]);

// POST: een beheeractie. Tonen (de meldingen tot nu tellen niet meer), verbergen, verwijderen, vastpinnen, iemand uitsluiten
// of weer toelaten, en nieuwe berichten tijdelijk dicht of open. Elke actie komt in het auditspoor.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Deze actie begrijpen we niet.");
  const a = parsed.data;
  let samenvatting: string;
  if (a.actie === "tonen" || a.actie === "verbergen" || a.actie === "verwijderen") {
    const fotos = await beheerBericht(a.actie, a.onderwerpId, a.reactieId, a.reden);
    await wisFotos(fotos);
    samenvatting = `Community: bericht ${a.onderwerpId}${a.reactieId ? `/${a.reactieId}` : ""} ${a.actie === "tonen" ? "getoond" : a.actie === "verbergen" ? "verborgen" : "verwijderd"}`;
  } else if (a.actie === "vastpinnen" || a.actie === "losmaken") {
    await zetVastgepind(a.onderwerpId, a.actie === "vastpinnen");
    samenvatting = `Community: onderwerp ${a.onderwerpId} ${a.actie === "vastpinnen" ? "vastgepind" : "losgemaakt"}`;
  } else if (a.actie === "uitsluiten") {
    const onderwerp = await leesOnderwerp(a.onderwerpId);
    const b = a.reactieId ? (await leesReacties(a.onderwerpId)).find((r) => r.id === a.reactieId) : onderwerp;
    if (!b || !b.auteurId || b.team) throw AppError.validation("Bij dit bericht hoort geen account om uit te sluiten.");
    if (b.auteurId === principal.userId) throw AppError.validation("Jezelf uitsluiten kan niet.");
    await sluitUit(b.auteurId, principal.userId, a.reden);
    samenvatting = `Community: account ${b.auteurId} uitgesloten`;
  } else if (a.actie === "toelaten") {
    await laatWeerToe(a.userId);
    samenvatting = `Community: account ${a.userId} weer toegelaten`;
  } else {
    await zetInstelling({ schrijvenDicht: a.dicht });
    samenvatting = `Community: nieuwe berichten ${a.dicht ? "dicht" : "open"}`;
  }
  await recordAudit({
    category: "ADMIN",
    action: `community.${a.actie}`,
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: samenvatting,
    targetType: "community",
    targetId: "onderwerpId" in a ? a.onderwerpId : "userId" in a ? a.userId : "instelling",
  }).catch(() => undefined);
  return NextResponse.json(await beheerOverzicht());
});
