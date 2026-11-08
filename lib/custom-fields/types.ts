import { z } from "zod";

export type FieldType = "text" | "number" | "email" | "select" | "multiselect" | "date" | "time" | "datetime" | "checkbox" | "radio" | "textarea" | "file" | "rating" | "phone" | "url";

export interface FieldOption {
  id: string;
  label: string;
  value: string;
}

export interface CustomField {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  disabled?: boolean;
  hidden?: boolean;
  helpText?: string;
  placeholder?: string;
  defaultValue?: string | number | boolean | string[];
  options?: FieldOption[];
  validation?: FieldValidation;
  conditional?: ConditionalDisplay;
  metadata?: Record<string, unknown>;
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  pattern?: string;
  customValidator?: string; // function code
  errorMessage?: string;
}

export interface ConditionalDisplay {
  fieldId: string;
  operator: "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan";
  value: string | number;
  show: boolean;
}

export interface FormField extends CustomField {
  order: number;
  section?: string;
}

export interface FormSection {
  id: string;
  name: string;
  label: string;
  order: number;
  description?: string;
  collapsed?: boolean;
}

const FieldOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
});

const FieldValidationSchema = z.object({
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  pattern: z.string().optional(),
  customValidator: z.string().optional(),
  errorMessage: z.string().optional(),
});

const ConditionalDisplaySchema = z.object({
  fieldId: z.string(),
  operator: z.enum(["equals", "notEquals", "contains", "greaterThan", "lessThan"]),
  value: z.union([z.string(), z.number()]),
  show: z.boolean(),
});

export const CustomFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "email", "select", "multiselect", "date", "time", "datetime", "checkbox", "radio", "textarea", "file", "rating", "phone", "url"]),
  required: z.boolean().default(false),
  disabled: z.boolean().optional(),
  hidden: z.boolean().optional(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  options: z.array(FieldOptionSchema).optional(),
  validation: FieldValidationSchema.optional(),
  conditional: ConditionalDisplaySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const FormFieldSchema = CustomFieldSchema.extend({
  order: z.number(),
  section: z.string().optional(),
});

export const FormSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  order: z.number(),
  description: z.string().optional(),
  collapsed: z.boolean().optional(),
});
