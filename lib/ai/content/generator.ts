import { logger } from "@/lib/ops/logger";

interface GenerationRequest {
  type: "profile" | "job" | "marketing" | "email" | "social" | "caption" | "seo";
  data: Record<string, any>;
  style?: "formal" | "casual" | "energetic";
  language?: string;
}

export async function generateContent(request: GenerationRequest): Promise<string> {
  try {
    switch (request.type) {
      case "profile":
        return generateProfileDescription(request.data);
      case "job":
        return generateJobDescription(request.data);
      case "marketing":
        return generateMarketingCopy(request.data);
      case "email":
        return generateEmailTemplate(request.data);
      case "social":
        return generateSocialPost(request.data);
      case "caption":
        return generateImageCaption(request.data);
      case "seo":
        return generateSEOContent(request.data);
      default:
        throw new Error(`Unknown content type: ${request.type}`);
    }
  } catch (err) {
    logger.error("Content generation failed", { request, err });
    throw err;
  }
}

function generateProfileDescription(data: { name: string; skills: string[]; experience: string }): string {
  const skillList = data.skills.join(", ");
  return `Meet ${data.name}, a skilled professional with expertise in ${skillList}. With ${data.experience} years of experience, ready for new challenges.`;
}

function generateJobDescription(data: { title: string; type: string; requirements: string[]; pay: number }): string {
  const reqs = data.requirements.join(", ");
  return `${data.title} - ${data.type} position. Looking for candidates with ${reqs}. Competitive pay: €${data.pay}/hour. Apply now!`;
}

function generateMarketingCopy(data: { product: string; features: string[]; benefit: string }): string {
  return `Discover ${data.product}. ${data.features.join(", ")}. ${data.benefit}. Get started today!`;
}

function generateEmailTemplate(data: { recipient: string; subject: string; body: string }): string {
  return `Subject: ${data.subject}\n\nDear ${data.recipient},\n\n${data.body}\n\nBest regards,\nZekerFlex Team`;
}

function generateSocialPost(data: { message: string; hashtags: string[] }): string {
  const tags = data.hashtags.map(h => `#${h}`).join(" ");
  return `${data.message}\n\n${tags}`;
}

function generateImageCaption(data: { image: string; context: string }): string {
  return `Beautiful ${data.context} moment captured. Experience the best with ZekerFlex!`;
}

function generateSEOContent(data: { keyword: string; title: string; description: string }): string {
  return `Title: ${data.title}\nMeta: ${data.description}\nKeyword focus: ${data.keyword}`;
}

export async function optimizeForSEO(content: string, keywords: string[]): Promise<string> {
  let optimized = content;

  // Add keywords naturally
  for (const keyword of keywords) {
    if (!content.toLowerCase().includes(keyword.toLowerCase())) {
      optimized += ` ${keyword}.`;
    }
  }

  // Improve structure
  optimized = optimized
    .replace(/\n/g, "\n")
    .replace(/\.(?=[A-Z])/g, ".\n");

  return optimized;
}
