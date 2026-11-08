import { z } from 'zod';

export const ContentFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['text', 'richText', 'number', 'boolean', 'date', 'select', 'media', 'relationship']),
  required: z.boolean().default(false),
  defaultValue: z.any().optional(),
  validation: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const ContentTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  fields: z.array(ContentFieldSchema),
  relationships: z.record(z.object({
    contentTypeId: z.string(),
    multiple: z.boolean().default(false),
  })).optional(),
  inherits: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ContentField = z.infer<typeof ContentFieldSchema>;
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ContentVersionSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  version: z.number(),
  data: z.record(z.any()),
  createdBy: z.string(),
  createdAt: z.date(),
  changeDescription: z.string().optional(),
});

export type ContentVersion = z.infer<typeof ContentVersionSchema>;

export const ContentStateEnum = z.enum(['draft', 'review', 'published', 'archived']);

export const ContentSchema = z.object({
  id: z.string(),
  typeId: z.string(),
  title: z.string(),
  slug: z.string(),
  state: ContentStateEnum,
  data: z.record(z.any()),
  version: z.number().default(1),
  createdBy: z.string(),
  updatedBy: z.string(),
  publishedBy: z.string().optional(),
  publishedAt: z.date().optional(),
  scheduledPublishAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  locale: z.string().default('nl'),
  metadata: z.record(z.any()).optional(),
});

export type Content = z.infer<typeof ContentSchema>;

export class ContentTypeManager {
  async createType(type: Omit<ContentType, 'createdAt' | 'updatedAt'>) {
    return { ...type, createdAt: new Date(), updatedAt: new Date() };
  }

  async updateType(id: string, updates: Partial<ContentType>) {
    return { ...updates, id, updatedAt: new Date() };
  }

  async getType(id: string): Promise<ContentType | null> {
    // Implementation
    return null;
  }

  async listTypes() {
    return [];
  }

  validateContent(type: ContentType, data: Record<string, any>) {
    const schema: Record<string, z.ZodType> = {};
    for (const field of type.fields) {
      if (field.type === 'text') schema[field.name] = z.string();
      else if (field.type === 'richText') schema[field.name] = z.string();
      else if (field.type === 'number') schema[field.name] = z.number();
      else if (field.type === 'boolean') schema[field.name] = z.boolean();
      else if (field.type === 'date') schema[field.name] = z.date();

      if (!field.required) {
        schema[field.name] = (schema[field.name] as z.ZodType).optional();
      }
    }

    return z.object(schema).safeParse(data);
  }
}
