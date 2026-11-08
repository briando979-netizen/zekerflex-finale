export interface RankTracking {
  keyword: string;
  currentRank: number;
  previousRank: number;
  changeDirection: 'up' | 'down' | 'stable';
  change: number;
  lastUpdated: Date;
  trafficEstimate: number;
}

export interface SEOMonitoring {
  domain: string;
  trackingData: RankTracking[];
  totalTraffic: number;
  visibilityScore: number;
  updateFrequency: string;
}

export const trackKeywordRanks = async (keywords: string[]): Promise<RankTracking[]> => {
  return keywords.map(keyword => ({
    keyword,
    currentRank: Math.floor(Math.random() * 100),
    previousRank: Math.floor(Math.random() * 100),
    changeDirection: ['up', 'down', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'stable',
    change: Math.floor(Math.random() * 20 - 10),
    lastUpdated: new Date(),
    trafficEstimate: Math.floor(Math.random() * 1000),
  }));
};

export const analyzeTrafficChanges = (
  current: number,
  previous: number
): { change: number; percent: number; trend: 'up' | 'down' | 'stable' } => {
  const change = current - previous;
  const percent = (change / previous) * 100;
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'stable';

  return { change, percent, trend };
};

export const trackCompetitors = async (
  domain: string,
  competitors: string[]
): Promise<Record<string, RankTracking[]>> => {
  const results: Record<string, RankTracking[]> = {};

  for (const competitor of competitors) {
    results[competitor] = await trackKeywordRanks(['seo', 'marketing', 'optimization']);
  }

  return results;
};

export const generateSEOReport = (
  monitoring: SEOMonitoring,
  period: 'monthly' | 'quarterly' | 'annual'
): SEOReport => {
  const topKeywords = monitoring.trackingData
    .sort((a, b) => b.trafficEstimate - a.trafficEstimate)
    .slice(0, 10);

  const gainers = monitoring.trackingData
    .filter(t => t.changeDirection === 'up')
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);

  const losers = monitoring.trackingData
    .filter(t => t.changeDirection === 'down')
    .sort((a, b) => a.change - b.change)
    .slice(0, 5);

  return {
    domain: monitoring.domain,
    period,
    generatedAt: new Date(),
    totalTraffic: monitoring.totalTraffic,
    visibilityScore: monitoring.visibilityScore,
    topKeywords,
    gainers,
    losers,
    recommendations: generateRecommendations(gainers, losers),
  };
};

interface SEOReport {
  domain: string;
  period: 'monthly' | 'quarterly' | 'annual';
  generatedAt: Date;
  totalTraffic: number;
  visibilityScore: number;
  topKeywords: RankTracking[];
  gainers: RankTracking[];
  losers: RankTracking[];
  recommendations: string[];
}

const generateRecommendations = (gainers: RankTracking[], losers: RankTracking[]): string[] => {
  const recs: string[] = [];

  if (gainers.length > 3) {
    recs.push(`Great progress! ${gainers.length} keywords improved their rankings. Analyze what's working and apply similar strategies to other pages.`);
  }

  if (losers.length > 3) {
    recs.push(`${losers.length} keywords lost rankings. Review these pages for technical issues, outdated content, or new competition.`);
  }

  if (losers.length === 0) {
    recs.push('No ranking losses detected. Continue your current SEO strategy.');
  }

  recs.push('Consider increasing content production for high-performing keywords.');
  recs.push('Build more backlinks from high-authority domains.');

  return recs;
};

export const monitoringAlerts = (
  tracking: RankTracking[],
  threshold: number = 5
): Array<{ keyword: string; alert: string; severity: 'high' | 'medium' | 'low' }> => {
  const alerts: Array<{ keyword: string; alert: string; severity: 'high' | 'medium' | 'low' }> = [];

  for (const track of tracking) {
    if (track.change < -threshold) {
      alerts.push({
        keyword: track.keyword,
        alert: `Ranking dropped ${Math.abs(track.change)} positions`,
        severity: track.change < -10 ? 'high' : 'medium',
      });
    }
  }

  return alerts;
};
