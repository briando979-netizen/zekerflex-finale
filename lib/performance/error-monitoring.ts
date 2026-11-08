/**
 * Error monitoring — Sentry integration, categorization, alerting
 */

import { z } from "zod";

export const foutRapportSchema = z.object({
  id: z.string().cuid(),
  code: z.string(),
  bericht: z.string(),
  categorie: z.enum([
    "JAVASCRIPT",
    "NETWERK",
    "DATABASE",
    "AUTHENTICATIE",
    "VALIDATIE",
    "ONBEKEND",
  ]),
  ernst: z.enum(["laag", "gemiddeld", "hoog", "kritiek"]),
  stapel: z.string().optional(),
  url: z.string().optional(),
  userId: z.string().optional(),
  omgeving: z.enum(["dev", "staging", "production"]),
  voorgekomen: z.number().positive().default(1),
  eersteKeer: z.date(),
  laasteKeer: z.date(),
  opgelost: z.boolean().default(false),
});

export type FoutRapport = z.infer<typeof foutRapportSchema>;

export interface FoutMetrics {
  totaalFouten: number;
  uniekeFouten: number;
  foutSnelheid: number; // per minuut
  actieveWaarschuwingen: number;
}

export const FOUT_CATEGORISERING: Record<string, string> = {
  "TypeError": "JAVASCRIPT",
  "ReferenceError": "JAVASCRIPT",
  "SyntaxError": "JAVASCRIPT",
  "Network error": "NETWERK",
  "Timeout": "NETWERK",
  "ECONNREFUSED": "NETWERK",
  "database connection": "DATABASE",
  "query failed": "DATABASE",
  "401": "AUTHENTICATIE",
  "403": "AUTHENTICATIE",
  "validation failed": "VALIDATIE",
  "Invalid input": "VALIDATIE",
};

export const ERNST_CLASSIFICATIE: Record<string, "laag" | "gemiddeld" | "hoog" | "kritiek"> = {
  "404": "laag",
  "400": "gemiddeld",
  "500": "hoog",
  "502": "kritiek",
  "503": "kritiek",
  "undefined is not a function": "hoog",
  "Cannot read property": "gemiddeld",
};

export function categoriseError(
  fout: Error | string,
): "JAVASCRIPT" | "NETWERK" | "DATABASE" | "AUTHENTICATIE" | "VALIDATIE" | "ONBEKEND" {
  const bericht = fout instanceof Error ? fout.message : fout;

  for (const [sleutelwoord, categorie] of Object.entries(FOUT_CATEGORISERING)) {
    if (bericht.toLowerCase().includes(sleutelwoord.toLowerCase())) {
      return categorie as any;
    }
  }

  return "ONBEKEND";
}

export function classificeerErnstigheid(
  bericht: string,
  statusCode?: number,
): "laag" | "gemiddeld" | "hoog" | "kritiek" {
  if (statusCode) {
    const statusClassificatie = ERNST_CLASSIFICATIE[statusCode.toString()];
    if (statusClassificatie) return statusClassificatie;
  }

  for (const [sleutelwoord, ernst] of Object.entries(ERNST_CLASSIFICATIE)) {
    if (bericht.toLowerCase().includes(sleutelwoord.toLowerCase())) {
      return ernst;
    }
  }

  return "gemiddeld";
}

export function createErrorReport(
  error: Error | string,
  context?: {
    url?: string;
    userId?: string;
    omgeving?: "dev" | "staging" | "production";
    statusCode?: number;
  },
): FoutRapport {
  const bericht = error instanceof Error ? error.message : error;
  const stapel = error instanceof Error ? error.stack : undefined;
  const now = new Date();

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    code: error instanceof Error ? error.name : "ERROR",
    bericht,
    categorie: categoriseError(error),
    ernst: classificeerErnstigheid(bericht, context?.statusCode),
    stapel,
    url: context?.url,
    userId: context?.userId,
    omgeving: context?.omgeving ?? "production",
    voorgekomen: 1,
    eersteKeer: now,
    laasteKeer: now,
    opgelost: false,
  };
}

export function shouldAlertError(fout: FoutRapport): boolean {
  return fout.ernst === "kritiek" || fout.ernst === "hoog";
}

export function batchErrorAnalysis(fouten: FoutRapport[]): FoutRapport[] {
  const kaart = new Map<string, FoutRapport>();

  for (const fout of fouten) {
    const sleutel = `${fout.code}:${fout.bericht}`;
    const bestaande = kaart.get(sleutel);

    if (bestaande) {
      bestaande.voorgekomen += fout.voorgekomen;
      bestaande.laasteKeer = fout.laasteKeer;
    } else {
      kaart.set(sleutel, fout);
    }
  }

  return Array.from(kaart.values())
    .sort((a, b) => b.voorgekomen - a.voorgekomen)
    .slice(0, 100);
}

export function calculateErrorMetrics(fouten: FoutRapport[], intervalMinuten: number = 60): FoutMetrics {
  const now = new Date();
  const cutoff = new Date(now.getTime() - intervalMinuten * 60000);

  const recenteFouten = fouten.filter((f) => f.laasteKeer >= cutoff);
  const uniekeFouten = new Set(recenteFouten.map((f) => `${f.code}:${f.bericht}`)).size;

  const totaalFoutInstances = recenteFouten.reduce((som, f) => som + f.voorgekomen, 0);
  const foutSnelheid = intervalMinuten > 0 ? totaalFoutInstances / intervalMinuten : 0;

  const actieveWaarschuwingen = recenteFouten.filter((f) => shouldAlertError(f)).length;

  return {
    totaalFouten: totaalFoutInstances,
    uniekeFouten,
    foutSnelheid,
    actieveWaarschuwingen,
  };
}

export function generateErrorSummary(fouten: FoutRapport[]): {
  top: FoutRapport[];
  categorieverdelingen: Record<string, number>;
  ernstVerdelingen: Record<string, number>;
} {
  const top = fouten.slice(0, 10);

  const categorieverdelingen: Record<string, number> = {};
  const ernstVerdelingen: Record<string, number> = {};

  for (const fout of fouten) {
    categorieverdelingen[fout.categorie] = (categorieverdelingen[fout.categorie] ?? 0) + fout.voorgekomen;
    ernstVerdelingen[fout.ernst] = (ernstVerdelingen[fout.ernst] ?? 0) + fout.voorgekomen;
  }

  return {
    top,
    categorieverdelingen,
    ernstVerdelingen,
  };
}

/**
 * Sentry-configuratie (zonder daadwerkelijke SDK-afhankelijkheid)
 */
export const sentryConfig = {
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  enabled: !!process.env.SENTRY_DSN,
};

export function shouldSendToSentry(fout: FoutRapport): boolean {
  return sentryConfig.enabled && (fout.ernst === "kritiek" || fout.ernst === "hoog");
}
