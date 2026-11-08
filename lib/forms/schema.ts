import { z } from 'zod';

export type FieldType =
  | 'text' | 'email' | 'phone' | 'number' | 'currency'
  | 'date' | 'datetime' | 'time' | 'select' | 'multiselect'
  | 'checkbox' | 'radio' | 'textarea' | 'file' | 'signature';

export const FormFieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['text', 'email', 'phone', 'number', 'currency', 'date', 'datetime', 'time', 'select', 'multiselect', 'checkbox', 'radio', 'textarea', 'file', 'signature']),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  validation: z.object({
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    customRule: z.string().optional(),
  }).optional(),
  conditional: z.object({
    fieldId: z.string(),
    operator: z.enum(['equals', 'notEquals', 'contains', 'greaterThan']),
    value: z.string(),
  }).optional(),
});

export const FormPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema),
});

export const FormSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  pages: z.array(FormPageSchema),
  settings: z.object({
    progressBar: z.boolean().default(true),
    autoSave: z.boolean().default(true),
    saveInterval: z.number().default(30000),
    allowDraftSave: z.boolean().default(true),
    redirectUrl: z.string().optional(),
  }).optional(),
  webhooks: z.array(z.object({
    url: z.string().url(),
    event: z.enum(['submit', 'save', 'error']),
    headers: z.record(z.string()).optional(),
  })).optional(),
  emailNotification: z.object({
    enabled: z.boolean().default(false),
    to: z.string().email().optional(),
    subject: z.string().optional(),
    template: z.string().optional(),
  }).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type FormField = z.infer<typeof FormFieldSchema>;
export type FormPage = z.infer<typeof FormPageSchema>;
export type Form = z.infer<typeof FormSchema>;
