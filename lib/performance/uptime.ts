/**
 * Uptime monitoring — healthchecks, incident tracking, SLA %
 */

import { z } from "zod";

export const healthcheckResultaatSchema = z.object({
  id: z.string().cuid(),
  dienst: z.string(),
  status: z.enum(["gezond", "gedegradeerd", "onbereikbaar"]),
  responseTijd: z.number().positive(),
  statusCode: z.number(),
  bericht: z.string().optional(),
  tijdstempel: z.date(),
  regio: z.string().optional(),
});

export type HealthcheckResultaat = z.infer<typeof healthcheckResultaatSchema>;

export const incidentSchema = z.object({
  id: z.string().cuid(),
  dienst: z.string(),
  begin: z.date(),
  einde: z.date().optional(),
  oorzaak: z.string(),
  ernst: z.enum(["laag", "gemiddeld", "hoog", "kritiek"]),
  aangepasteServices: z.array(z.string()).default([]),
  opgelost: z.boolean().default(false),
});

export type Incident = z.infer<typeof incidentSchema>;

export interface UptimeMetrics {
  dienst: string;
  uptime: number; // percentage
  avoiding: number; // days
  incidenten: number;
  gemiddeldeResponseTijd: number; // ms
}

export interface SLADoelstelling {
  dienst: string;
  doelUptime: number; // percentage, e.g., 99.9
  doelResponseTijd: number; // ms
  incidentBudget: number; // allowed downtime in minutes per month
}

export const STANDAARD_SLA_DOELSTELLINGEN: Record<string, SLADoelstelling> = {
  API: {
    dienst: "API",
    doelUptime: 99.9,
    doelResponseTijd: 500,
    incidentBudget: 43.2, // ~43 minuten per maand
  },
  WEBAPP: {
    dienst: "Web App",
    doelUptime: 99.5,
    doelResponseTijd: 1000,
    incidentBudget: 216, // ~3.6 uren per maand
  },
  DATABASE: {
    dienst: "Database",
    doelUptime: 99.99,
    doelResponseTijd: 100,
    incidentBudget: 4.3, // ~4.3 minuten per maand
  },
};

export const RESPONSE_TIJD_DREMPELS = {
  gezond: 200,
  gedegradeerd: 1000,
  onbereikbaar: Infinity,
} as const;

export function evaluateHealthStatus(
  responseTijd: number,
  statusCode: number,
): "gezond" | "gedegradeerd" | "onbereikbaar" {
  if (statusCode >= 500) return "onbereikbaar";
  if (responseTijd > RESPONSE_TIJD_DREMPELS.gedegradeerd) return "gedegradeerd";
  if (statusCode >= 400) return "gedegradeerd";
  return "gezond";
}

export function logHealthcheck(
  dienst: string,
  responseTijd: number,
  statusCode: number,
  bericht?: string,
  regio?: string,
): HealthcheckResultaat {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    dienst,
    status: evaluateHealthStatus(responseTijd, statusCode),
    responseTijd,
    statusCode,
    bericht,
    tijdstempel: new Date(),
    regio,
  };
}

export function calculateUptime(
  resultaten: HealthcheckResultaat[],
  periodeDagen: number = 30,
): number {
  if (resultaten.length === 0) return 100;

  const now = new Date();
  const cutoff = new Date(now.getTime() - periodeDagen * 24 * 60 * 60 * 1000);

  const recente = resultaten.filter((r) => r.tijdstempel >= cutoff);
  if (recente.length === 0) return 100;

  const gezonde = recente.filter((r) => r.status === "gezond").length;
  return (gezonde / recente.length) * 100;
}

export function calculateAveraggeResponseTime(
  resultaten: HealthcheckResultaat[],
  periodeDagen: number = 30,
): number {
  if (resultaten.length === 0) return 0;

  const now = new Date();
  const cutoff = new Date(now.getTime() - periodeDagen * 24 * 60 * 60 * 1000);

  const recente = resultaten.filter((r) => r.tijdstempel >= cutoff);
  if (recente.length === 0) return 0;

  const totaal = recente.reduce((som, r) => som + r.responseTijd, 0);
  return totaal / recente.length;
}

export function evaluteSLACompliance(
  metrics: UptimeMetrics,
  sla: SLADoelstelling,
): {
  compliant: boolean;
  afwijkingen: string[];
  risico: "laag" | "gemiddeld" | "hoog";
} {
  const afwijkingen: string[] = [];

  if (metrics.uptime < sla.doelUptime) {
    afwijkingen.push(
      `Uptime ${metrics.uptime.toFixed(2)}% is onder doel van ${sla.doelUptime}%`,
    );
  }

  if (metrics.gemiddeldeResponseTijd > sla.doelResponseTijd) {
    afwijkingen.push(
      `Responstijd ${metrics.gemiddeldeResponseTijd}ms exceeds target ${sla.doelResponseTijd}ms`,
    );
  }

  let risico: "laag" | "gemiddeld" | "hoog" = "laag";
  if (afwijkingen.length > 0) {
    risico = afwijkingen.length > 1 ? "hoog" : "gemiddeld";
  }

  return {
    compliant: afwijkingen.length === 0,
    afwijkingen,
    risico,
  };
}

export function logIncident(
  dienst: string,
  oorzaak: string,
  ernst: "laag" | "gemiddeld" | "hoog" | "kritiek",
  aangepasteServices?: string[],
): Incident {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    dienst,
    begin: new Date(),
    oorzaak,
    ernst,
    aangepasteServices,
    opgelost: false,
  };
}

export function calculateDowntime(incident: Incident): number {
  const einde = incident.einde ?? new Date();
  return (einde.getTime() - incident.begin.getTime()) / (1000 * 60); // minutes
}

export function calculateMTTR(incidents: Incident[]): number {
  if (incidents.length === 0) return 0;

  const opgeloste = incidents.filter((i) => i.einde);
  if (opgeloste.length === 0) return 0;

  const totaaltijd = opgeloste.reduce(
    (som, i) => som + (i.einde?.getTime() ?? 0 - i.begin.getTime()),
    0,
  );

  return totaaltijd / opgeloste.length / (1000 * 60); // average in minutes
}

export function berekdenIncidentBudgetRemaining(
  incidents: Incident[],
  sla: SLADoelstelling,
  maandstart: Date = new Date(new Date().setDate(1)),
): number {
  const maandend = new Date(maandstart.getFullYear(), maandstart.getMonth() + 1, 0);

  const maandincidents = incidents.filter(
    (i) => i.begin >= maandstart && i.begin <= maandend,
  );

  const gebruikteTijd = maandincidents.reduce((som, i) => som + calculateDowntime(i), 0);
  return Math.max(0, sla.incidentBudget - gebruikteTijd);
}

export function shouldAlertIncident(incident: Incident): boolean {
  return incident.ernst === "kritiek" || incident.ernst === "hoog";
}
