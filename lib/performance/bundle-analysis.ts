/**
 * Bundle analysis — code splitting, dead code detection, size alerts
 */

import { z } from "zod";

export const bundleModuleSchema = z.object({
  naam: z.string(),
  grootte: z.number().positive(),
  gzip: z.number().positive(),
  afhankelijkheden: z.array(z.string()).default([]),
  isAangelegd: z.boolean().default(false),
});

export type BundleModule = z.infer<typeof bundleModuleSchema>;

export const bundleAnalyseSchema = z.object({
  versie: z.string(),
  tijdstempel: z.date(),
  totaalGrootte: z.number().positive(),
  gzipGrootte: z.number().positive(),
  modules: z.array(bundleModuleSchema),
  waarschuwingen: z.array(z.string()).default([]),
});

export type BundleAnalyse = z.infer<typeof bundleAnalyseSchema>;

export const GROOTTE_WAARSCHUWINGEN = {
  KLEIN: 100 * 1024, // 100 KB
  GEMIDDELD: 500 * 1024, // 500 KB
  GROOT: 1024 * 1024, // 1 MB
} as const;

export function detectGrootteWaarschuwing(module: BundleModule): string | null {
  if (module.grootte > GROOTTE_WAARSCHUWINGEN.GROOT) {
    return `Module ${module.naam} is te groot (${formatBytes(module.grootte)})`;
  }

  if (module.grootte > GROOTTE_WAARSCHUWINGEN.GEMIDDELD) {
    return `Module ${module.naam} is behoorlijk groot (${formatBytes(module.grootte)})`;
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function analyzeBundle(modules: BundleModule[]): BundleAnalyse {
  const totaalGrootte = modules.reduce((som, m) => som + m.grootte, 0);
  const gzipGrootte = modules.reduce((som, m) => som + m.gzip, 0);

  const waarschuwingen: string[] = [];

  for (const mod of modules) {
    const waarschuwing = detectGrootteWaarschuwing(mod);
    if (waarschuwing) {
      waarschuwingen.push(waarschuwing);
    }
  }

  const dubbelen = detectDuplicatesDependencies(modules);
  if (dubbelen.length > 0) {
    waarschuwingen.push(`Gedetecteerde dubbele afhankelijkheden: ${dubbelen.join(", ")}`);
  }

  return {
    versie: `${Date.now()}`,
    tijdstempel: new Date(),
    totaalGrootte,
    gzipGrootte,
    modules,
    waarschuwingen,
  };
}

export function detectDeadCode(modules: BundleModule[]): BundleModule[] {
  return modules.filter((m) => m.afhankelijkheden.length === 0 && m.isAangelegd === false);
}

export function detectDuplicatesDependencies(modules: BundleModule[]): string[] {
  const versies = new Map<string, number>();

  for (const mod of modules) {
    for (const dep of mod.afhankelijkheden) {
      const basisnaam = dep.split("@")[0];
      versies.set(basisnaam, (versies.get(basisnaam) ?? 0) + 1);
    }
  }

  return Array.from(versies.entries())
    .filter(([, aantal]) => aantal > 1)
    .map(([naam]) => naam);
}

export function calculateCompressionRatio(
  analyse: BundleAnalyse,
): number {
  if (analyse.totaalGrootte === 0) return 0;
  return ((analyse.totaalGrootte - analyse.gzipGrootte) / analyse.totaalGrootte) * 100;
}

export function shouldAlertBundleSize(analyse: BundleAnalyse, drempel: number = 2 * 1024 * 1024): boolean {
  return analyse.totaalGrootte > drempel;
}

export interface CodeSplitSuggestie {
  module: string;
  voorstel: string;
  geschatteBesparing: number;
}

export function suggestCodeSplitting(modules: BundleModule[]): CodeSplitSuggestie[] {
  const suggesties: CodeSplitSuggestie[] = [];

  for (const mod of modules) {
    if (mod.grootte > GROOTTE_WAARSCHUWINGEN.GROOT && mod.afhankelijkheden.length > 5) {
      suggesties.push({
        module: mod.naam,
        voorstel: `Code-split ${mod.naam} in kleinere chunks`,
        geschatteBesparing: mod.grootte * 0.2,
      });
    }
  }

  return suggesties.sort((a, b) => b.geschatteBesparing - a.geschatteBesparing);
}
