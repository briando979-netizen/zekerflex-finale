export interface Keyword {
  term: string;
  searchVolume: number;
  difficulty: number; // 0-100
  competition: 'low' | 'medium' | 'high';
  trend: 'up' | 'stable' | 'down';
  cpc?: number;
  relatedKeywords: string[];
}

export interface KeywordCluster {
  primary: string;
  secondaries: string[];
  searchVolume: number;
  difficulty: number;
}

export const suggestKeywords = (seed: string): Keyword[] => {
  const keywords: Keyword[] = [];

  const variations = [
    seed,
    `best ${seed}`,
    `${seed} for beginners`,
    `${seed} tips`,
    `how to ${seed}`,
    `${seed} guide`,
    `${seed} tools`,
    `${seed} software`,
    `free ${seed}`,
    `${seed} alternatives`,
  ];

  for (const term of variations) {
    keywords.push({
      term,
      searchVolume: Math.floor(Math.random() * 10000),
      difficulty: Math.floor(Math.random() * 100),
      competition: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as 'low' | 'medium' | 'high',
      trend: ['up', 'stable', 'down'][Math.floor(Math.random() * 3)] as 'up' | 'stable' | 'down',
      cpc: Math.random() * 5,
      relatedKeywords: generateRelated(term),
    });
  }

  return keywords.sort((a, b) => b.searchVolume - a.searchVolume);
};

const generateRelated = (keyword: string): string[] => {
  return [
    `${keyword} review`,
    `${keyword} comparison`,
    `${keyword} pricing`,
    `${keyword} tutorial`,
    `${keyword} reddit`,
  ];
};

export const clusterKeywords = (keywords: Keyword[]): KeywordCluster[] => {
  const clusters: KeywordCluster[] = [];
  const primary = keywords[0];

  if (primary) {
    clusters.push({
      primary: primary.term,
      secondaries: keywords.slice(1, 5).map(k => k.term),
      searchVolume: primary.searchVolume,
      difficulty: primary.difficulty,
    });
  }

  return clusters;
};

export const analyzeSeasonality = (keyword: string): Record<string, number> => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const seasonality: Record<string, number> = {};

  for (const month of months) {
    seasonality[month] = Math.random() * 100;
  }

  return seasonality;
};

export const findLongTailKeywords = (seed: string): string[] => {
  return [
    `best ${seed} for small business`,
    `${seed} cost comparison`,
    `how much does ${seed} cost`,
    `${seed} vs alternatives`,
    `${seed} for beginners step by step`,
    `cheapest ${seed} option`,
    `${seed} free trial`,
    `${seed} without credit card`,
  ];
};
