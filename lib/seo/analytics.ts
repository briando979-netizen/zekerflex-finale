/**
 * SEO Analytics tracking voor landingspagina's.
 * Page views, bounce rate, conversions, sector/city performance.
 */

export interface PageViewEvent {
  sectorSlug: string;
  citySlug: string;
  pageType: 'employer' | 'worker';
  timestamp: Date;
  referrer?: string;
  userAgent?: string;
  sessionId: string;
}

export interface ConversionEvent {
  sectorSlug: string;
  citySlug: string;
  pageType: 'employer' | 'worker';
  conversionType: 'signup' | 'login' | 'job_applied' | 'job_posted';
  timestamp: Date;
  sessionId: string;
  userId?: string;
  value?: number;
}

export interface SeoAnalytics {
  sectorSlug: string;
  citySlug: string;
  pageType: 'employer' | 'worker';
  totalViews: number;
  uniqueVisitors: number;
  bounceRate: number; // 0-100
  averageSessionDuration: number; // seconden
  conversions: number;
  conversionRate: number; // 0-100
  lastUpdated: Date;
}

export interface SectorCityStats {
  sector: string;
  city: string;
  employerViews: number;
  workerViews: number;
  employerConversions: number;
  workerConversions: number;
  totalViews: number;
  totalConversions: number;
  performance: 'excellent' | 'good' | 'average' | 'poor';
}

/**
 * Bepaal performance level op basis van metriek.
 */
export function determinePerformanceLevel(
  views: number,
  conversions: number
): 'excellent' | 'good' | 'average' | 'poor' {
  if (views === 0) return 'poor';

  const conversionRate = (conversions / views) * 100;

  if (conversionRate >= 3 && views >= 100) return 'excellent';
  if (conversionRate >= 1.5 && views >= 50) return 'good';
  if (conversionRate >= 0.5 && views >= 20) return 'average';

  return 'poor';
}

/**
 * Bereken bounce rate (verhogend met sessieduur < 30 seconden).
 */
export function calculateBounceRate(
  totalSessions: number,
  shortSessions: number // < 30 sec
): number {
  if (totalSessions === 0) return 0;
  return Math.round((shortSessions / totalSessions) * 100);
}

/**
 * Bereken conversion rate.
 */
export function calculateConversionRate(
  views: number,
  conversions: number
): number {
  if (views === 0) return 0;
  return Math.round((conversions / views) * 100 * 100) / 100; // 2 decimalen
}

/**
 * Genereer dagelijkse rapportage per sector.
 */
export function generateSectorReport(
  sectorSlug: string,
  data: SectorCityStats[]
): {
  sector: string;
  totalViews: number;
  totalConversions: number;
  averageConversionRate: number;
  topCities: SectorCityStats[];
  bottomCities: SectorCityStats[];
} {
  const sectorData = data.filter((d) => d.sector === sectorSlug);

  const totalViews = sectorData.reduce((sum, d) => sum + d.totalViews, 0);
  const totalConversions = sectorData.reduce((sum, d) => sum + d.totalConversions, 0);
  const avgRate = calculateConversionRate(totalViews, totalConversions);

  const sorted = [...sectorData].sort((a, b) => b.totalViews - a.totalViews);

  return {
    sector: sectorSlug,
    totalViews,
    totalConversions,
    averageConversionRate: avgRate,
    topCities: sorted.slice(0, 5),
    bottomCities: sorted.slice(-5),
  };
}

/**
 * Genereer dagelijkse rapportage per stad.
 */
export function generateCityReport(
  citySlug: string,
  data: SectorCityStats[]
): {
  city: string;
  totalViews: number;
  totalConversions: number;
  averageConversionRate: number;
  topSectors: SectorCityStats[];
} {
  const cityData = data.filter((d) => d.city === citySlug);

  const totalViews = cityData.reduce((sum, d) => sum + d.totalViews, 0);
  const totalConversions = cityData.reduce((sum, d) => sum + d.totalConversions, 0);
  const avgRate = calculateConversionRate(totalViews, totalConversions);

  const sorted = [...cityData].sort((a, b) => b.totalViews - a.totalViews);

  return {
    city: citySlug,
    totalViews,
    totalConversions,
    averageConversionRate: avgRate,
    topSectors: sorted.slice(0, 5),
  };
}

/**
 * Identificeer onderperformers (pagina's die aandacht nodig hebben).
 */
export function identifyUnderperformers(
  data: SectorCityStats[],
  viewsThreshold: number = 20
): SectorCityStats[] {
  return data.filter((item) => {
    const conversionRate = calculateConversionRate(
      item.totalViews,
      item.totalConversions
    );
    return item.totalViews >= viewsThreshold && conversionRate < 0.5;
  });
}

/**
 * Identificeer overperformers (best practices).
 */
export function identifyOverperformers(
  data: SectorCityStats[],
  viewsThreshold: number = 20
): SectorCityStats[] {
  return data.filter((item) => {
    const conversionRate = calculateConversionRate(
      item.totalViews,
      item.totalConversions
    );
    return item.totalViews >= viewsThreshold && conversionRate >= 2;
  });
}

/**
 * Bereken trend (week-over-week growth).
 */
export function calculateTrend(
  currentWeekViews: number,
  previousWeekViews: number
): number {
  if (previousWeekViews === 0) return 0;
  return Math.round(
    (((currentWeekViews - previousWeekViews) / previousWeekViews) * 100) * 100
  ) / 100;
}

/**
 * Genereer SEO health score (0-100).
 */
export function generateSeoHealthScore(
  data: SectorCityStats[]
): number {
  if (data.length === 0) return 0;

  const scores: number[] = data.map((item) => {
    let score = 0;

    // Views score (max 30 punten)
    const avgViews = data.reduce((sum, d) => sum + d.totalViews, 0) / data.length;
    if (item.totalViews > 0) {
      score += Math.min(30, (item.totalViews / avgViews) * 15);
    }

    // Conversion rate score (max 40 punten)
    const convRate = calculateConversionRate(item.totalViews, item.totalConversions);
    const avgConvRate =
      data.reduce((sum, d) => sum + calculateConversionRate(d.totalViews, d.totalConversions), 0) /
      data.length;
    if (avgConvRate > 0) {
      score += Math.min(40, (convRate / avgConvRate) * 20);
    }

    // Performance score (max 30 punten)
    const perfScore =
      item.performance === 'excellent'
        ? 30
        : item.performance === 'good'
          ? 20
          : item.performance === 'average'
            ? 10
            : 0;
    score += perfScore;

    return score;
  });

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Genereer recommendations op basis van analytics data.
 */
export function generateRecommendations(
  data: SectorCityStats[]
): string[] {
  const recommendations: string[] = [];

  const underperformers = identifyUnderperformers(data);
  if (underperformers.length > 5) {
    recommendations.push(
      `${underperformers.length} pagina's hebben lage conversion rates. Overweeg A/B testing of copy-optimisatie.`
    );
  }

  const overperformers = identifyOverperformers(data);
  if (overperformers.length > 0) {
    recommendations.push(
      `Beste performers: ${overperformers.map((p) => `${p.sector} in ${p.city}`).join(', ')}. Repliceer deze aanpak.`
    );
  }

  const lowViewPages = data.filter((d) => d.totalViews < 5);
  if (lowViewPages.length > data.length / 2) {
    recommendations.push(
      'Meer dan de helft van de pagina\'s heeft zeer weinig traffic. Controleer indexering en interne links.'
    );
  }

  return recommendations;
}
