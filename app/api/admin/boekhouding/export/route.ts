import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { leesExport, leesExportControle, leesXaf } from "@/lib/boekhouding/export/export";
import { AFDRUK_CSP, afdrukPagina, kolommenbalansHtml, winstVerliesHtml } from "@/lib/boekhouding/export/afdruk";
import { kolommenbalansCsv, winstVerliesCsv } from "@/lib/boekhouding/export/kern";
import { EXPORT_BESTAND, EXPORT_FORMATEN, exportBestandsnaam, type ExportFormaat } from "@/lib/boekhouding/export/scherm-kern";
import { maakZip } from "@/lib/boekhouding/export/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;
const DAG = /^\d{4}-\d{2}-\d{2}$/;

const invoer = z.object({
  administratieId: z.string().trim().regex(ID, "Kies een geldige administratie."),
  formaat: z.enum(EXPORT_FORMATEN, { message: "Kies een formaat: xaf, kolommenbalans-csv, wv-csv, kolommenbalans-html, wv-html, alles-zip of controle." }),
  jaar: z.coerce.number().int("Het jaar is geen geldig jaar.").optional(),
  van: z.string().trim().regex(DAG, "De begindatum is geen geldige dag (verwacht: JJJJ-MM-DD).").optional(),
  tot: z.string().trim().regex(DAG, "De einddatum is geen geldige dag (verwacht: JJJJ-MM-DD).").optional(),
});

const nuTekst = (waarde: string | null): string | undefined => (waarde === null || waarde === "" ? undefined : waarde);

const kop = (formaat: Exclude<ExportFormaat, "controle">, naam: string): Record<string, string> => ({
  "Content-Type": EXPORT_BESTAND[formaat].type,
  "Content-Disposition": `${formaat.endsWith("-html") ? "inline" : "attachment"}; filename="${naam}"`,
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  ...(formaat.endsWith("-html") ? { "Content-Security-Policy": AFDRUK_CSP } : {}),
});

// GET ?administratieId=&formaat=&jaar= (of &van=&tot=): de export voor de accountant. Alleen lezen. Het formaat "controle"
// geeft JSON met wat je nog moet doen; de andere formaten zijn bestanden zonder persoonsgegevens in de naam.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const q = new URL(request.url).searchParams;
  const p = invoer.parse({
    administratieId: q.get("administratieId"),
    formaat: q.get("formaat"),
    jaar: nuTekst(q.get("jaar")),
    van: nuTekst(q.get("van")),
    tot: nuTekst(q.get("tot")),
  });
  const periode = { jaar: p.jaar, van: p.van, tot: p.tot };

  if (p.formaat === "controle") return NextResponse.json(await leesExportControle(p.administratieId, periode), { headers: { "Cache-Control": "private, no-store" } });

  let inhoud: string | Uint8Array;
  let naam: string;
  if (p.formaat === "xaf") {
    // een auditfile gaat over één heel boekjaar
    if (p.jaar === undefined) throw AppError.validation("Een auditfile gaat over één heel boekjaar. Kies een boekjaar in plaats van een begin- en einddatum.");
    const x = await leesXaf(p.administratieId, p.jaar);
    inhoud = x.xaf.xml;
    naam = exportBestandsnaam("xaf", x.periode.van, x.periode.tot, x.soort);
  } else {
    const g = await leesExport(p.administratieId, periode);
    const { van, tot } = g.periode;
    const soort = g.administratie.soort;
    if (p.formaat === "kolommenbalans-csv") {
      inhoud = kolommenbalansCsv(g.kolommen);
    } else if (p.formaat === "wv-csv") {
      inhoud = winstVerliesCsv(g.wv);
    } else if (p.formaat === "kolommenbalans-html") {
      inhoud = afdrukPagina("Kolommenbalans", [kolommenbalansHtml(g.kolommen, g.administratie.naam)]);
    } else if (p.formaat === "wv-html") {
      inhoud = afdrukPagina("Winst- en verliesrekening", [winstVerliesHtml(g.wv, g.administratie.naam)]);
    } else {
      // alles-zip: de auditfile (alleen bij een heel boekjaar) en beide CSV-bestanden
      const enc = new TextEncoder();
      const bestanden = [
        { naam: exportBestandsnaam("kolommenbalans-csv", van, tot, soort), inhoud: enc.encode(kolommenbalansCsv(g.kolommen)) },
        { naam: exportBestandsnaam("wv-csv", van, tot, soort), inhoud: enc.encode(winstVerliesCsv(g.wv)) },
      ];
      if (g.periode.heelBoekjaar) {
        const x = await leesXaf(p.administratieId, g.periode.jaar);
        bestanden.unshift({ naam: exportBestandsnaam("xaf", van, tot, soort), inhoud: enc.encode(x.xaf.xml) });
      }
      inhoud = maakZip(bestanden);
    }
    naam = exportBestandsnaam(p.formaat, van, tot, soort);
  }

  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.export",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: export voor de accountant gedownload",
    targetType: "boekAdministratie",
    targetId: p.administratieId,
    metadata: { formaat: p.formaat, ...(p.jaar !== undefined ? { jaar: p.jaar } : {}), ...(p.van && p.tot ? { van: p.van, tot: p.tot } : {}) },
  });
  return new Response(inhoud as BodyInit, { headers: kop(p.formaat, naam) });
});
