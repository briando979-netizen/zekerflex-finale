/**
 * Sectör-landingspagina's genereren voor 5 sectoren × 21 steden = 105 pagina's.
 * Elke pagina combineert sector-copy met échte lokale context.
 */

import { SECTORS } from '@/lib/seo-sectors';
import { CITIES } from '@/lib/seo-cities';

export interface LandingPageConfig {
  sectorSlug: string;
  citySlug: string;
  sectorLabel: string;
  cityName: string;
  province: string;
  routes: {
    employer: string;
    worker: string;
  };
}

/**
 * Genereer alle 105 sector × stad combinaties.
 */
export function generateAllLandingConfigs(): LandingPageConfig[] {
  const configs: LandingPageConfig[] = [];

  for (const sector of SECTORS) {
    for (const city of CITIES) {
      configs.push({
        sectorSlug: sector.slug,
        citySlug: city.slug,
        sectorLabel: sector.label,
        cityName: city.name,
        province: city.province,
        routes: {
          employer: `/werkgever/${sector.slug}/${city.slug}`,
          worker: `/${sector.workerSlug}/${city.slug}`,
        },
      });
    }
  }

  return configs;
}

/**
 * Haal één specifieke config op.
 */
export function getLandingConfig(
  sectorSlug: string,
  citySlug: string
): LandingPageConfig | null {
  const sector = SECTORS.find((s) => s.slug === sectorSlug);
  const city = CITIES.find((c) => c.slug === citySlug);

  if (!sector || !city) {
    return null;
  }

  return {
    sectorSlug,
    citySlug,
    sectorLabel: sector.label,
    cityName: city.name,
    province: city.province,
    routes: {
      employer: `/werkgever/${sector.slug}/${city.slug}`,
      worker: `/${sector.workerSlug}/${city.slug}`,
    },
  };
}

/**
 * Genereer dynamische page title voor werkgever.
 */
export function generateEmployerPageTitle(
  sectorLabel: string,
  cityName: string
): string {
  return `${sectorLabel} personeel inhuren in ${cityName} | ZekerFlex`;
}

/**
 * Genereer dynamische page description voor werkgever.
 */
export function generateEmployerPageDescription(
  sectorLabel: string,
  cityName: string,
  roles: string
): string {
  return `Zoek ${sectorLabel.toLowerCase()} flexwerk personeel in ${cityName}. Snel en flexibel: ${roles}. Minder kosten, minder gedoe.`;
}

/**
 * Genereer dynamische page title voor werker.
 */
export function generateWorkerPageTitle(
  sectorLabel: string,
  cityName: string
): string {
  return `${sectorLabel} vacatures in ${cityName} | Flexwerk ZekerFlex`;
}

/**
 * Genereer dynamische page description voor werker.
 */
export function generateWorkerPageDescription(
  sectorLabel: string,
  cityName: string
): string {
  return `${sectorLabel} werk in ${cityName}? Dagwerk, avondwerk, weekendwerk. Direct beschikbaar op ZekerFlex.`;
}

/**
 * Lijst van alle sectorslug + cityslug combinaties.
 * Voor sitemap, analytics tracking, etc.
 */
export function getAllLandingPagePairs(): Array<{
  sector: string;
  city: string;
}> {
  const pairs: Array<{ sector: string; city: string }> = [];
  for (const sector of SECTORS) {
    for (const city of CITIES) {
      pairs.push({
        sector: sector.slug,
        city: city.slug,
      });
    }
  }
  return pairs;
}

/**
 * Controleer of een landingspagina geldig is.
 */
export function isValidLandingPage(sectorSlug: string, citySlug: string): boolean {
  return (
    SECTORS.some((s) => s.slug === sectorSlug) &&
    CITIES.some((c) => c.slug === citySlug)
  );
}

/**
 * Haal sector-gegevens op voor een pagina.
 */
export function getSectorForPage(sectorSlug: string) {
  return SECTORS.find((s) => s.slug === sectorSlug);
}

/**
 * Haal stad-gegevens op voor een pagina.
 */
export function getCityForPage(citySlug: string) {
  return CITIES.find((c) => c.slug === citySlug);
}
