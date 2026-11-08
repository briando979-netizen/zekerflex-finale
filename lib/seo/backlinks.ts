export interface Backlink {
  url: string;
  sourceUrl: string;
  anchorText: string;
  domainAuthority: number;
  spam: number;
  referralTraffic: number;
  dateFound: Date;
}

export interface BacklinkAnalysis {
  totalBacklinks: number;
  referringDomains: number;
  domainAuthority: number;
  averageDomainAuthority: number;
  topBacklinks: Backlink[];
  spamScore: number;
}

export interface CompetitorBacklinks {
  competitor: string;
  backlinks: Backlink[];
  topSources: Array<{ domain: string; count: number }>;
}

export const trackBacklinks = async (domain: string): Promise<BacklinkAnalysis> => {
  const backlinks: Backlink[] = generateMockBacklinks();

  const referringDomains = new Set(backlinks.map(b => new URL(b.sourceUrl).hostname)).size;
  const domainAuthority = Math.min(100, Math.floor(referringDomains / 5));
  const avgDA = backlinks.reduce((a, b) => a + b.domainAuthority, 0) / backlinks.length;
  const spamScore = backlinks.filter(b => b.spam > 30).length / backlinks.length * 100;

  return {
    totalBacklinks: backlinks.length,
    referringDomains,
    domainAuthority,
    averageDomainAuthority: Math.round(avgDA * 10) / 10,
    topBacklinks: backlinks.sort((a, b) => b.domainAuthority - a.domainAuthority).slice(0, 10),
    spamScore: Math.round(spamScore),
  };
};

const generateMockBacklinks = (): Backlink[] => {
  const sources = [
    'techcrunch.com',
    'forbes.com',
    'medium.com',
    'blog.example.com',
    'news.ycombinator.com',
    'reddit.com',
    'github.com',
  ];

  return sources.map(source => ({
    url: 'https://zekerflex.com',
    sourceUrl: `https://${source}/article`,
    anchorText: 'ZekerFlex',
    domainAuthority: Math.floor(Math.random() * 70 + 20),
    spam: Math.floor(Math.random() * 40),
    referralTraffic: Math.floor(Math.random() * 500),
    dateFound: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
  }));
};

export const analyzeCompetitorBacklinks = async (competitor: string): Promise<CompetitorBacklinks> => {
  const backlinks = generateMockBacklinks();
  const topSources: Record<string, number> = {};

  for (const backlink of backlinks) {
    const domain = new URL(backlink.sourceUrl).hostname;
    topSources[domain] = (topSources[domain] || 0) + 1;
  }

  return {
    competitor,
    backlinks,
    topSources: Object.entries(topSources)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
};

export const qualityScore = (backlink: Backlink): number => {
  let score = 100;
  score -= backlink.spam;
  score += backlink.domainAuthority;
  score += Math.min(50, backlink.referralTraffic / 10);
  return Math.max(0, Math.min(100, score));
};

export const findBrokenLinks = async (url: string): Promise<string[]> => {
  return [
    'https://example.com/old-page',
    'https://example.com/404',
    'https://example.com/removed',
  ];
};

export const buildDisavowList = (backlinks: Backlink[], spamThreshold: number = 40): string[] => {
  return backlinks
    .filter(b => b.spam > spamThreshold)
    .map(b => new URL(b.sourceUrl).hostname)
    .filter((v, i, a) => a.indexOf(v) === i);
};
