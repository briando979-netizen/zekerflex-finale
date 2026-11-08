import { FormField } from './schema';

export interface ValidationError {
  fieldId: string;
  message: string;
}

export function validateField(field: FormField, value: any): ValidationError | null {
  if (field.required && !value) {
    return { fieldId: field.id, message: `${field.label} is required` };
  }

  if (!value) return null;

  const validation = field.validation;
  if (!validation) return null;

  if (validation.minLength && String(value).length < validation.minLength) {
    return { fieldId: field.id, message: `Minimum ${validation.minLength} characters` };
  }

  if (validation.maxLength && String(value).length > validation.maxLength) {
    return { fieldId: field.id, message: `Maximum ${validation.maxLength} characters` };
  }

  if (validation.pattern) {
    const regex = new RegExp(validation.pattern);
    if (!regex.test(String(value))) {
      return { fieldId: field.id, message: `Invalid format for ${field.label}` };
    }
  }

  return null;
}

export function validateFormData(fields: FormField[], data: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];

  fields.forEach(field => {
    const error = validateField(field, data[field.id]);
    if (error) errors.push(error);
  });

  return errors;
}

export function applyConditionalValidation(
  fields: FormField[],
  data: Record<string, any>,
  errors: ValidationError[]
): ValidationError[] {
  return fields
    .filter(field => {
      if (!field.conditional) return true;
      const referencedField = fields.find(f => f.id === field.conditional!.fieldId);
      if (!referencedField) return true;

      const refValue = data[field.conditional!.fieldId];
      const { operator, value } = field.conditional!;

      switch (operator) {
        case 'equals': return refValue === value;
        case 'notEquals': return refValue !== value;
        case 'contains': return String(refValue).includes(value);
        case 'greaterThan': return Number(refValue) > Number(value);
        default: return true;
      }
    })
    .reduce((acc: ValidationError[], field) => {
      const error = validateField(field, data[field.id]);
      return error ? [...acc, error] : acc;
    }, errors);
}
