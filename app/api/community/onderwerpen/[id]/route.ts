import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { idUitPad } from "@/lib/community/regels";
import { verwijderEigen } from "@/lib/community/store";
import { wisFotos } from "@/lib/community/fotos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/community/onderwerpen/<id>[?reactie=<reactieId>]: je eigen onderwerp of reactie verwijderen. Tekst en foto's
// gaan weg; er blijft alleen "verwijderd" staan. Van een ander: een nette 404, geen 403 (CrowdSec).
export const DELETE = withAuth<{ id: string }>(async (request, { params, principal }) => {
  const id = idUitPad(params.id);
  if (!id) throw AppError.notFound("Dit onderwerp bestaat niet.");
  const reactie = new URL(request.url).searchParams.get("reactie");
  if (reactie !== null && !/^[a-z0-9]{4,32}$/.test(reactie)) throw AppError.notFound("Deze reactie bestaat niet.");
  const fotos = await verwijderEigen(principal.userId, id, reactie);
  await wisFotos(fotos);
  return NextResponse.json({ ok: true });
});
