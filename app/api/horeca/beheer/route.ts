import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { companyDefaults } from "@/lib/sites/access";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { aanzettenSchema, beheerActieSchema, lees } from "@/lib/horeca/schema";
import { beheerContext, eisBeheer } from "@/lib/horeca/toegang";
import {
  bewaarCategorie,
  bewaarItem,
  maakZaak,
  menukaart,
  verwijderCategorie,
  verwijderItem,
  werkGegevensBij,
  zetBeschikbaar,
  zetModuleAan,
  zetOnline,
  zetOpeningstijden,
} from "@/lib/horeca/store";
import { maandbedrag } from "@/lib/horeca/modules";
import { zaakWeergave } from "@/lib/horeca/weergave";
import type { HorecaZaak } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Het beheer van het horeca-pakket (/werkgever/horeca). GET geeft alles voor
// het scherm, POST één actie (lib/horeca/schema.ts). Alleen de beheerder van
// het bedrijf (lib/horeca/toegang.ts).

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

async function alles(zaak: HorecaZaak) {
  const kaart = await menukaart(zaak.id);
  return { aan: true, zaak: zaakWeergave(zaak), ...kaart, maand: maandbedrag(zaak.modules) };
}

export async function GET(): Promise<NextResponse> {
  try {
    const { p, tenantId, zaak } = await beheerContext();
    if (!zaak) {
      const d = await companyDefaults(tenantId, p);
      return NextResponse.json({ aan: false, voorstel: { naam: d.naam, plaats: d.plaats, telefoon: d.telefoon, email: d.email } });
    }
    return NextResponse.json(await alles(zaak));
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const body: unknown = await request.json().catch(() => null);
    if ((body as { actie?: unknown } | null)?.actie === "aanzetten") {
      const { tenantId } = await beheerContext();
      const { actie: _actie, ...g } = lees(aanzettenSchema, body);
      return NextResponse.json(await alles(await maakZaak(tenantId, g)));
    }
    const { zaak } = await eisBeheer();
    const a = lees(beheerActieSchema, body);
    let nu = zaak;
    switch (a.actie) {
      case "gegevens": {
        const { actie: _a, ...g } = a;
        nu = await werkGegevensBij(zaak, g);
        break;
      }
      case "online":
        nu = await zetOnline(zaak, a.online);
        break;
      case "openingstijden":
        nu = await zetOpeningstijden(zaak, a.tijden);
        break;
      case "module":
        nu = await zetModuleAan(zaak, a.module, a.aan);
        break;
      case "categorie":
        await bewaarCategorie(zaak, { id: a.id, naam: a.naam });
        break;
      case "categorie-weg":
        await verwijderCategorie(zaak, a.id);
        break;
      case "item": {
        const { actie: _a, ...it } = a;
        await bewaarItem(zaak, it);
        break;
      }
      case "item-weg":
        await verwijderItem(zaak, a.id);
        break;
      case "beschikbaar":
        await zetBeschikbaar(zaak, a.id, a.beschikbaar);
        break;
    }
    return NextResponse.json(await alles(nu));
  } catch (err) {
    return fout(err);
  }
}
