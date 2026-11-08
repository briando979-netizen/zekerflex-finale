import { z } from 'zod';

export const LocalizationSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  locale: z.string(),
  data: z.record(z.any()),
  translatedFields: z.array(z.string()),
  status: z.enum(['original', 'translated', 'review', 'approved']).default('original'),
  translatedBy: z.string().optional(),
  translatedAt: z.date().optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.date().optional(),
  translationMemory: z.array(z.object({
    original: z.string(),
    translated: z.string(),
    language: z.string(),
  })).optional(),
});

export type Localization = z.infer<typeof LocalizationSchema>;

export class LocalizationManager {
  private fallbackLocales: Record<string, string> = {
    'nl-BE': 'nl',
    'nl-NL': 'nl',
    'en-GB': 'en',
    'en-US': 'en',
    'fr-FR': 'fr',
    'fr-BE': 'fr',
  };

  async createTranslation(contentId: string, locale: string, data: Record<string, any>) {
    return {
      id: `trans_${Date.now()}`,
      contentId,
      locale,
      data,
      translatedFields: Object.keys(data),
      status: 'translated' as const,
      translatedAt: new Date(),
    };
  }

  async submitForTranslationReview(id: string) {
    return {
      id,
      status: 'review' as const,
    };
  }

  async approveTranslation(id: string, approver: string) {
    return {
      id,
      status: 'approved' as const,
      approvedBy: approver,
      approvedAt: new Date(),
    };
  }

  async getContentInLocale(contentId: string, locale: string, fallbackLocale = 'nl') {
    return {
      contentId,
      locale,
      data: {},
      status: 'approved',
    };
  }

  async setFallback(locale: string, fallbackTo: string) {
    this.fallbackLocales[locale] = fallbackTo;
    return { locale, fallbackTo };
  }

  async addToTranslationMemory(original: string, translated: string, language: string) {
    return {
      original,
      translated,
      language,
      addedAt: new Date(),
    };
  }

  async suggestTranslation(text: string, targetLocale: string) {
    // In real implementation, would use TM or AI
    return {
      text,
      suggestedTranslation: text,
      confidence: 0.95,
      targetLocale,
    };
  }

  async listAvailableLocales(contentId: string) {
    return ['nl', 'en', 'fr', 'de'];
  }

  async bulkTranslate(contentId: string, sourceLocale: string, targetLocales: string[]) {
    return {
      contentId,
      sourceLocale,
      targetLocales,
      status: 'queued',
      jobId: `job_${Date.now()}`,
    };
  }
}
