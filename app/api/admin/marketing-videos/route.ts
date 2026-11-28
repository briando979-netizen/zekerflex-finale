import { getPrincipal, hasRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { genereerbouwenProject, MARKETING_TEMPLATES } from "@/lib/marketing/video-config";
import { type Formaat } from "@/lib/video/model";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await getPrincipal();
    if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
      return new Response(JSON.stringify({ error: { message: "Geen toegang" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await request.json()) as {
      action?: string;
      templates?: string[];
    };

    if (body.action === "generate") {
      // Genereer video project configs
      const templates = (body.templates || []).filter((id: string) =>
        MARKETING_TEMPLATES.some((t) => t.id === id)
      );

      if (!templates.length) {
        throw AppError.validation("Geen geldige templates opgegeven");
      }

      const projects = [];

      for (const templateId of templates) {
        // Landscape
        const landscape = genereerbouwenProject(templateId, "16:9" as Formaat);
        if (landscape) projects.push(landscape);

        // Vertical
        const vertical = genereerbouwenProject(templateId, "9:16" as Formaat);
        if (vertical) projects.push(vertical);
      }

      logger.info(`Generated ${projects.length} video projects`, {
        templates,
        count: projects.length,
      });

      return new Response(
        JSON.stringify({
          status: "queued",
          count: projects.length,
          projects: projects.map((p) => ({
            id: p.id,
            naam: p.naam,
            formaat: p.formaat,
            duur: "calculated-on-render",
          })),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (body.action === "list") {
      return new Response(
        JSON.stringify({
          templates: MARKETING_TEMPLATES.map((t) => ({
            id: t.id,
            titel: t.titel,
            beschrijving: t.beschrijving,
            tags: t.tags,
            duur: t.teksten.lengte,
            regels: t.teksten.regels.length,
          })),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    throw AppError.validation(`Onbekend action: ${body.action}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fout bij video-generatie";
    logger.error("Marketing video generation failed", { error: message });

    return new Response(
      JSON.stringify({
        error: {
          message,
        },
      }),
      {
        status: err instanceof AppError ? err.httpStatus : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function GET(request: Request) {
  try {
    const principal = await getPrincipal();
    if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
      return new Response(JSON.stringify({ error: { message: "Geen toegang" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "list") {
      return new Response(
        JSON.stringify({
          templates: MARKETING_TEMPLATES.map((t) => ({
            id: t.id,
            titel: t.titel,
            beschrijving: t.beschrijving,
            tags: t.tags,
            duur: t.teksten.lengte,
            regels: t.teksten.regels.length,
          })),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Gebruik POST met action",
        actions: ["generate", "list"],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fout";
    return new Response(JSON.stringify({ error: { message } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
