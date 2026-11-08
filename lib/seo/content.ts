export interface ContentRecommendation {
  type: 'keyword-placement' | 'structure' | 'length' | 'headers' | 'links' | 'images';
  message: string;
  priority: 'high' | 'medium' | 'low';
  action: string;
}

export const optimizeContent = (
  content: string,
  targetKeyword: string,
  currentMeta: { title: string; description: string; url: string }
): ContentRecommendation[] => {
  const recommendations: ContentRecommendation[] = [];

  // Keyword placement
  const lowerContent = content.toLowerCase();
  const keywordCount = (lowerContent.match(new RegExp(targetKeyword.toLowerCase(), 'g')) || []).length;
  const wordCount = content.split(/\s+/).length;
  const keywordDensity = (keywordCount / wordCount) * 100;

  if (keywordDensity < 1) {
    recommendations.push({
      type: 'keyword-placement',
      message: `Target keyword "${targetKeyword}" appears only ${keywordCount} times`,
      priority: 'high',
      action: `Add keyword to first 100 words, headers, and throughout content (aim for 1-3% density)`,
    });
  }

  if (keywordDensity > 5) {
    recommendations.push({
      type: 'keyword-placement',
      message: `Keyword density too high (${keywordDensity.toFixed(1)}%)`,
      priority: 'high',
      action: 'Reduce keyword frequency to avoid over-optimization',
    });
  }

  // Title optimization
  if (!currentMeta.title.toLowerCase().includes(targetKeyword.toLowerCase())) {
    recommendations.push({
      type: 'structure',
      message: 'Target keyword missing from title',
      priority: 'high',
      action: `Add "${targetKeyword}" to the page title`,
    });
  }

  if (currentMeta.title.length < 30) {
    recommendations.push({
      type: 'structure',
      message: 'Title too short',
      priority: 'medium',
      action: 'Expand title to 30-60 characters',
    });
  }

  // Meta description
  if (currentMeta.description.length < 120) {
    recommendations.push({
      type: 'structure',
      message: 'Meta description too short',
      priority: 'medium',
      action: 'Expand meta description to 120-160 characters and include target keyword',
    });
  }

  // Content length
  if (wordCount < 300) {
    recommendations.push({
      type: 'length',
      message: `Content too short (${wordCount} words)`,
      priority: 'high',
      action: 'Expand content to at least 300-500 words (1000+ for competitive keywords)',
    });
  }

  // Headers
  const headers = content.match(/^#{1,6}\s+.+$/gm) || [];
  if (headers.length === 0) {
    recommendations.push({
      type: 'headers',
      message: 'No header hierarchy found',
      priority: 'high',
      action: 'Structure content with H1, H2, H3 headers',
    });
  }

  // Internal links
  const linkCount = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
  if (linkCount === 0) {
    recommendations.push({
      type: 'links',
      message: 'No internal links found',
      priority: 'medium',
      action: 'Add 3-5 internal links to relevant pages',
    });
  }

  // Image alt text
  const imageCount = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
  const altTagCount = (content.match(/!\[.+?\]\(/g) || []).length;
  if (imageCount > 0 && altTagCount < imageCount) {
    recommendations.push({
      type: 'images',
      message: `${imageCount - altTagCount} images missing alt text`,
      priority: 'medium',
      action: 'Add descriptive alt text to all images with target keyword in some',
    });
  }

  return recommendations.sort((a, b) => {
    const priorityMap = { high: 0, medium: 1, low: 2 };
    return priorityMap[a.priority] - priorityMap[b.priority];
  });
};

export const suggestMetaDescription = (content: string, keyword: string): string => {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
  let description = sentences[0] || content.substring(0, 140);

  if (!description.toLowerCase().includes(keyword.toLowerCase())) {
    description = `${keyword} - ${description}`;
  }

  return description.substring(0, 160);
};

export const suggestTitle = (keyword: string, contentType: string = 'guide'): string[] => {
  return [
    `The Ultimate Guide to ${keyword} in 2026`,
    `${keyword}: Everything You Need to Know`,
    `Best ${keyword} - [Year] Comparison & Tips`,
    `Complete ${keyword} Tutorial for Beginners`,
    `How to ${keyword}: Step-by-Step Instructions`,
  ];
};
