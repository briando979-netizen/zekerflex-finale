import { z } from "zod";
import type { FormField, FieldType } from "@/lib/custom-fields/types";

export function generateValidationSchema(fields: FormField[]): z.ZodSchema {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    shape[field.id] = getFieldValidator(field);
  }

  return z.object(shape);
}

function getFieldValidator(field: FormField): z.ZodTypeAny {
  let validator: z.ZodTypeAny;

  switch (field.type) {
    case "text":
      validator = z.string();
      if (field.validation?.minLength) validator = (validator as z.ZodString).min(field.validation.minLength);
      if (field.validation?.maxLength) validator = (validator as z.ZodString).max(field.validation.maxLength);
      if (field.validation?.pattern) validator = (validator as z.ZodString).regex(new RegExp(field.validation.pattern));
      break;

    case "email":
      validator = z.string().email();
      break;

    case "number":
      validator = z.number();
      if (field.validation?.minValue !== undefined) validator = (validator as z.ZodNumber).min(field.validation.minValue);
      if (field.validation?.maxValue !== undefined) validator = (validator as z.ZodNumber).max(field.validation.maxValue);
      break;

    case "phone":
      validator = z.string().regex(/^\+?[\d\s\-()]+$/);
      break;

    case "url":
      validator = z.string().url();
      break;

    case "date":
      validator = z.string().datetime();
      break;

    case "time":
      validator = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
      break;

    case "datetime":
      validator = z.string().datetime();
      break;

    case "checkbox":
      validator = z.boolean();
      break;

    case "radio":
    case "select":
      validator = z.string().refine((val) => field.options?.some((opt) => opt.value === val), {
        message: "Invalid selection",
      });
      break;

    case "multiselect":
      validator = z.array(z.string()).refine((vals) => vals.every((v) => field.options?.some((opt) => opt.value === v)), {
        message: "Invalid selection",
      });
      break;

    case "textarea":
      validator = z.string();
      if (field.validation?.maxLength) validator = (validator as z.ZodString).max(field.validation.maxLength);
      break;

    case "file":
      validator = z.instanceof(File);
      break;

    case "rating":
      validator = z.number().min(1).max(5);
      break;

    default:
      validator = z.any();
  }

  if (!field.required) {
    validator = validator.optional();
  } else {
    if (field.type === "text" || field.type === "textarea") {
      validator = (validator as z.ZodString).min(1, "Required");
    } else {
      validator = validator.refine((val) => val !== null && val !== undefined, "Required");
    }
  }

  if (field.defaultValue !== undefined) {
    validator = (validator as any).default(field.defaultValue);
  }

  return validator;
}

export function createFormDataEncoder(fields: FormField[]): (data: Record<string, unknown>) => Record<string, unknown> {
  return (data: Record<string, unknown>) => {
    const encoded: Record<string, unknown> = {};

    for (const field of fields) {
      if (data[field.id] === undefined || data[field.id] === null) {
        if (field.required) {
          throw new Error(`Field ${field.label} is required`);
        }
        continue;
      }

      const value = data[field.id];

      // Type-specific encoding
      if (field.type === "date" || field.type === "datetime") {
        encoded[field.id] = new Date(value as string).toISOString();
      } else if (field.type === "file") {
        encoded[field.id] = (value as File).name;
      } else if (field.type === "multiselect") {
        encoded[field.id] = Array.isArray(value) ? value : [value];
      } else {
        encoded[field.id] = value;
      }
    }

    return encoded;
  };
}

export function evaluateConditionals(fields: FormField[], formData: Record<string, unknown>): string[] {
  const hiddenFieldIds = new Set<string>();

  for (const field of fields) {
    if (!field.conditional) continue;

    const condField = formData[field.conditional.fieldId];
    if (condField === undefined || condField === null) {
      if (!field.conditional.show) hiddenFieldIds.add(field.id);
      continue;
    }

    const matches = evaluateCondition(condField, field.conditional.operator, field.conditional.value);

    if (field.conditional.show && !matches) {
      hiddenFieldIds.add(field.id);
    } else if (!field.conditional.show && matches) {
      hiddenFieldIds.add(field.id);
    }
  }

  return Array.from(hiddenFieldIds);
}

function evaluateCondition(value: unknown, operator: string, compareValue: string | number): boolean {
  switch (operator) {
    case "equals":
      return String(value) === String(compareValue);
    case "notEquals":
      return String(value) !== String(compareValue);
    case "contains":
      return String(value).includes(String(compareValue));
    case "greaterThan":
      return Number(value) > Number(compareValue);
    case "lessThan":
      return Number(value) < Number(compareValue);
    default:
      return false;
  }
}

export function getVisibleFields(fields: FormField[], formData: Record<string, unknown>): FormField[] {
  const hiddenIds = evaluateConditionals(fields, formData);
  return fields.filter((f) => !hiddenIds.includes(f.id) && !f.hidden);
}
