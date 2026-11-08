import { z } from 'zod';

export interface PageAnalysis {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  keywordDensity: Record<string, number>;
  readabilityScore: number;
  seoScore: number;
  issues: SEOIssue[];
  recommendations: string[];
}

export interface SEOIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export const analyzePageSEO = async (html: string, url: string): Promise<PageAnalysis> => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const title = doc.querySelector('title')?.textContent || '';
  const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => h.textContent || '');

  const bodyText = doc.body.textContent || '';
  const words = bodyText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const keywordDensity = calculateKeywordDensity(words);
  const readabilityScore = calculateReadability(bodyText);

  const issues: SEOIssue[] = [];

  if (!title || title.length === 0) issues.push({ type: 'error', message: 'Missing page title', severity: 'high' });
  if (title.length < 30) issues.push({ type: 'warning', message: 'Title too short (< 30 chars)', severity: 'medium' });
  if (title.length > 60) issues.push({ type: 'warning', message: 'Title too long (> 60 chars)', severity: 'medium' });

  if (!metaDescription) issues.push({ type: 'error', message: 'Missing meta description', severity: 'high' });
  if (metaDescription.length < 120) issues.push({ type: 'warning', message: 'Meta description too short', severity: 'medium' });
  if (metaDescription.length > 160) issues.push({ type: 'warning', message: 'Meta description too long', severity: 'medium' });

  const h1Count = doc.querySelectorAll('h1').length;
  if (h1Count === 0) issues.push({ type: 'error', message: 'Missing H1 tag', severity: 'high' });
  if (h1Count > 1) issues.push({ type: 'warning', message: 'Multiple H1 tags found', severity: 'medium' });

  const images = doc.querySelectorAll('img');
  const imagesWithoutAlt = Array.from(images).filter(img => !img.getAttribute('alt'));
  if (imagesWithoutAlt.length > 0) {
    issues.push({ type: 'warning', message: `${imagesWithoutAlt.length} images missing alt text`, severity: 'medium' });
  }

  const seoScore = calculateSEOScore(issues, title, metaDescription, headings);

  return {
    url,
    title,
    metaDescription,
    headings,
    keywordDensity,
    readabilityScore,
    seoScore,
    issues,
    recommendations: generateRecommendations(issues, title, metaDescription),
  };
};

const calculateKeywordDensity = (words: string[]): Record<string, number> => {
  const density: Record<string, number> = {};
  for (const word of words) {
    density[word] = (density[word] || 0) + 1;
  }
  for (const word in density) {
    density[word] = (density[word] / words.length) * 100;
  }
  return Object.fromEntries(Object.entries(density).sort((a, b) => b[1] - a[1]).slice(0, 20));
};

const calculateReadability = (text: string): number => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/);
  const avgWordsPerSentence = words.length / sentences.length;
  return Math.max(0, Math.min(100, 100 - avgWordsPerSentence * 5));
};

const calculateSEOScore = (issues: SEOIssue[], title: string, meta: string, headings: string[]): number => {
  let score = 100;
  score -= issues.filter(i => i.severity === 'high').length * 15;
  score -= issues.filter(i => i.severity === 'medium').length * 5;
  score -= issues.filter(i => i.severity === 'low').length * 2;
  return Math.max(0, Math.min(100, score));
};

const generateRecommendations = (issues: SEOIssue[], title: string, meta: string): string[] => {
  const recs: string[] = [];
  if (title.length < 30) recs.push('Increase title length to 30-60 characters');
  if (meta.length < 120) recs.push('Expand meta description to 120-160 characters');
  if (issues.some(i => i.message.includes('H1'))) recs.push('Add exactly one H1 tag to the page');
  if (issues.some(i => i.message.includes('alt'))) recs.push('Add descriptive alt text to all images');
  return recs;
};
