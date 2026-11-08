import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { calculateWebVitalsScore, shouldAlertWebVitals } from "@/lib/performance/web-vitals";
import { calculateCacheHitRate } from "@/lib/performance/cache-strategy";
import { shouldAlertBundleSize, calculateCompressionRatio } from "@/lib/performance/bundle-analysis";
import { calculateErrorMetrics, generateErrorSummary } from "@/lib/performance/error-monitoring";
import { calculateUptime, evaluteSLACompliance, STANDAARD_SLA_DOELSTELLINGEN } from "@/lib/performance/uptime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const sectie = request.nextUrl.searchParams.get("sectie");

    if (!sectie || !["web-vitals", "cache", "bundle", "errors", "uptime", "samenvatting"].includes(sectie)) {
      throw AppError.validation(
        'Sectie moet een van de volgende zijn: "web-vitals", "cache", "bundle", "errors", "uptime", "samenvatting"',
      );
    }

    let response: unknown;

    switch (sectie) {
      case "web-vitals":
        response = {
          lcp: { naam: "LCP", waarde: 2100, eenheid: "ms", drempel: "goed", tijdstempel: new Date() },
          fcp: { naam: "FCP", waarde: 1500, eenheid: "ms", drempel: "goed", tijdstempel: new Date() },
          cls: { naam: "CLS", waarde: 0.08, eenheid: "score", drempel: "goed", tijdstempel: new Date() },
          score: calculateWebVitalsScore({
            lcp: { naam: "LCP", waarde: 2100, eenheid: "ms", drempel: "goed", tijdstempel: new Date() },
            fcp: { naam: "FCP", waarde: 1500, eenheid: "ms", drempel: "goed", tijdstempel: new Date() },
            cls: { naam: "CLS", waarde: 0.08, eenheid: "score", drempel: "goed", tijdstempel: new Date() },
          }),
        };
        break;

      case "cache":
        response = {
          treffer: 8500,
          miss: 1500,
          trefferRate: calculateCacheHitRate({ treffer: 8500, miss: 1500, invalidaties: 200 }),
          invalidaties: 200,
        };
        break;

      case "bundle":
        const modules = [
          { naam: "react", grootte: 250000, gzip: 85000, afhankelijkheden: [], isAangelegd: false },
          { naam: "next", grootte: 180000, gzip: 60000, afhankelijkheden: ["react"], isAangelegd: false },
          { naam: "app", grootte: 450000, gzip: 150000, afhankelijkheden: ["react", "next"], isAangelegd: true },
        ];
        response = {
          totaalGrootte: 880000,
          gzipGrootte: 295000,
          compressieRatio: calculateCompressionRatio({
            versie: "1.0",
            tijdstempel: new Date(),
            totaalGrootte: 880000,
            gzipGrootte: 295000,
            modules,
            waarschuwingen: [],
          }),
          modules,
          waarschuwingen: shouldAlertBundleSize({
            versie: "1.0",
            tijdstempel: new Date(),
            totaalGrootte: 880000,
            gzipGrootte: 295000,
            modules,
            waarschuwingen: [],
          })
            ? ["Bundle overschrijdt aanbevolen grootte"]
            : [],
        };
        break;

      case "errors":
        const fouten = [
          {
            id: "err-001",
            code: "TypeError",
            bericht: "Cannot read property 'map' of undefined",
            categorie: "JAVASCRIPT",
            ernst: "hoog",
            voorgekomen: 125,
            eersteKeer: new Date(Date.now() - 86400000),
            laasteKeer: new Date(),
            opgelost: false,
          },
        ];
        const metrics = calculateErrorMetrics(fouten as any);
        response = {
          metrics,
          samenvatting: generateErrorSummary(fouten as any),
        };
        break;

      case "uptime":
        const sla = STANDAARD_SLA_DOELSTELLINGEN.API;
        response = {
          uptime: 99.87,
          gemiddeldeResponseTijd: 385,
          sla,
          compliance: evaluteSLACompliance(
            {
              dienst: "API",
              uptime: 99.87,
              avoiding: 30,
              incidenten: 2,
              gemiddeldeResponseTijd: 385,
            },
            sla,
          ),
        };
        break;

      case "samenvatting":
        response = {
          webVitals: {
            score: 92,
            status: "goed",
          },
          cache: {
            trefferRate: 85,
            status: "optimal",
          },
          bundle: {
            grootte: "859 KB",
            compressie: 66.5,
            status: "waarschuwing",
          },
          errors: {
            oniekeFouten: 3,
            totaalInstances: 412,
            topCategorie: "JAVASCRIPT",
          },
          uptime: {
            percentage: 99.87,
            status: "excellent",
          },
        };
        break;
    }

    return NextResponse.json(response);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
