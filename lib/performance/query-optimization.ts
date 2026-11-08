/**
 * Query optimization — slow query detection, index recommendations
 */

import { z } from "zod";

export const traagQuerySchema = z.object({
  id: z.string().cuid(),
  sql: z.string(),
  duur: z.number().positive(), // milliseconds
  rijen: z.number().nonnegative(),
  voorgekomen: z.number().positive().default(1),
  eersteKeer: z.date(),
  laasteKeer: z.date(),
  indexHulpstukkenvoor: z.array(z.string()).optional(),
});

export type TraagQuery = z.infer<typeof traagQuerySchema>;

export interface QueryMetrics {
  sql: string;
  duur: number;
  rijen: number;
  uitvoeringsplan?: string;
}

export const SLOW_QUERY_DREMPEL = 1000; // milliseconds
export const VERY_SLOW_QUERY_DREMPEL = 5000; // milliseconds

export function isSlowQuery(duur: number): boolean {
  return duur > SLOW_QUERY_DREMPEL;
}

export function isVerySlowQuery(duur: number): boolean {
  return duur > VERY_SLOW_QUERY_DREMPEL;
}

export function extractTableNames(sql: string): string[] {
  const patroon = /FROM\s+["'`]?(\w+)["'`]?|JOIN\s+["'`]?(\w+)["'`]?/gi;
  const overeenkomsten: string[] = [];
  let match;

  while ((match = patroon.exec(sql)) !== null) {
    const tabel = match[1] ?? match[2];
    if (tabel && !overeenkomsten.includes(tabel)) {
      overeenkomsten.push(tabel);
    }
  }

  return overeenkomsten;
}

export function extractWhereColumns(sql: string): string[] {
  const patroon = /WHERE\s+(.+?)(?:GROUP\s+BY|ORDER\s+BY|LIMIT|$)/gi;
  const match = patroon.exec(sql);

  if (!match || !match[1]) return [];

  const whereClause = match[1];
  const kolommen: string[] = [];
  const kolomPatroon = /(\w+)\s*[=><]/g;

  let kolomMatch;
  while ((kolomMatch = kolomPatroon.exec(whereClause)) !== null) {
    const kolom = kolomMatch[1];
    if (kolom && !kolommen.includes(kolom)) {
      kolommen.push(kolom);
    }
  }

  return kolommen;
}

export function suggestIndexes(sql: string): string[] {
  const hulpstukkenvoor: string[] = [];
  const tabellen = extractTableNames(sql);
  const wherkolommen = extractWhereColumns(sql);

  for (const tabel of tabellen) {
    for (const kolom of wherkolommen) {
      hulpstukkenvoor.push(`CREATE INDEX idx_${tabel}_${kolom} ON ${tabel}(${kolom})`);
    }
  }

  return [...new Set(hulpstukkenvoor)];
}

export function logSlowQuery(metrics: QueryMetrics): TraagQuery {
  const now = new Date();

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sql: metrics.sql,
    duur: metrics.duur,
    rijen: metrics.rijen,
    voorgekomen: 1,
    eersteKeer: now,
    laasteKeer: now,
    indexHulpstukkenvoor: suggestIndexes(metrics.sql),
  };
}

export function analyzeQueryPerformance(query: TraagQuery): {
  ernst: "laag" | "gemiddeld" | "hoog";
  aanbeveling: string;
} {
  if (query.duur > VERY_SLOW_QUERY_DREMPEL) {
    return {
      ernst: "hoog",
      aanbeveling: `Query duurt ${query.duur}ms — critiek. Voeg indexen toe: ${query.indexHulpstukkenvoor?.join(", ") || "geen suggesties"}`,
    };
  }

  if (query.duur > SLOW_QUERY_DREMPEL) {
    return {
      ernst: "gemiddeld",
      aanbeveling: `Query duurt ${query.duur}ms — traag. Overweeg indexen: ${query.indexHulpstukkenvoor?.join(", ") || "geen suggesties"}`,
    };
  }

  return {
    ernst: "laag",
    aanbeveling: "Query-prestaties zijn acceptabel.",
  };
}

export function batchQueryAnalysis(queries: TraagQuery[]): TraagQuery[] {
  const kaart = new Map<string, TraagQuery>();

  for (const query of queries) {
    const bestaande = kaart.get(query.sql);

    if (bestaande) {
      bestaande.voorgekomen += query.voorgekomen;
      bestaande.laasteKeer = query.laasteKeer;
    } else {
      kaart.set(query.sql, query);
    }
  }

  return Array.from(kaart.values()).sort((a, b) => b.duur - a.duur);
}
