/**
 * Data Mapping — Field transformation and type conversion between workflow steps
 * Handles data transformation, type coercion, and conditional mapping.
 */

export type TransformFunction = (value: unknown) => unknown;

export interface FieldMapping {
  source: string; // JSONPath: "$.user.email" or "steps.0.response.id"
  target: string; // JSONPath: "$.email"
  transform?: TransformFunction;
  required?: boolean;
  default?: unknown;
}

export interface DataMappingConfig {
  mappings: FieldMapping[];
  globalTransforms?: Record<string, TransformFunction>;
}

/**
 * Parse JSONPath and extract value from object
 */
function getValueByPath(obj: unknown, path: string): unknown {
  if (!path || path === "$") {
    return obj;
  }

  const parts = path
    .replace(/^\$\./, "")
    .split(".")
    .filter((p) => p.length > 0);

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array indices
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[parseInt(index, 10)];
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Set value in object by JSONPath
 */
function setValueByPath(obj: unknown, path: string, value: unknown): unknown {
  if (!path || path === "$") {
    return value;
  }

  const parts = path
    .replace(/^\$\./, "")
    .split(".")
    .filter((p) => p.length > 0);

  if (parts.length === 0) {
    return value;
  }

  const result: Record<string, unknown> = obj && typeof obj === "object" && !Array.isArray(obj)
    ? { ...obj as Record<string, unknown> }
    : {};

  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;

  return result;
}

/**
 * Transform value to target type
 */
function coerceType(
  value: unknown,
  targetType: string
): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  switch (targetType) {
    case "string":
      return String(value);
    case "number":
      return Number(value);
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    case "array":
      return Array.isArray(value) ? value : [value];
    case "object":
      return typeof value === "object" ? value : { value };
    case "date":
      return new Date(value as string | number);
    case "json":
      return typeof value === "string" ? JSON.parse(value as string) : value;
    default:
      return value;
  }
}

/**
 * Apply field mapping to transform data
 */
export function applyFieldMapping(
  sourceData: unknown,
  mapping: FieldMapping,
  stepResults: Record<string, unknown>
): unknown {
  // Resolve source value from either source data or previous step results
  let sourceValue: unknown;

  if (mapping.source.startsWith("steps.")) {
    // Reference to previous step result
    const stepData = getValueByPath(stepResults, mapping.source);
    sourceValue = stepData;
  } else {
    // Reference to source data
    sourceValue = getValueByPath(sourceData, mapping.source);
  }

  // Handle missing required fields
  if ((sourceValue === null || sourceValue === undefined) && mapping.required) {
    throw new Error(
      `Required field mapping failed: ${mapping.source} is not available`
    );
  }

  // Apply default value if not found
  if (sourceValue === null || sourceValue === undefined) {
    sourceValue = mapping.default ?? null;
  }

  // Apply transform function if provided
  if (mapping.transform && sourceValue !== null) {
    sourceValue = mapping.transform(sourceValue);
  }

  return sourceValue;
}

/**
 * Apply all field mappings to transform data
 */
export function applyDataMappings(
  sourceData: unknown,
  mappings: FieldMapping[],
  stepResults: Record<string, unknown> = {}
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    try {
      const value = applyFieldMapping(sourceData, mapping, stepResults);
      const target = setValueByPath({}, mapping.target, value);
      Object.assign(result, target);
    } catch (error) {
      if (mapping.required) {
        throw error;
      }
      // Skip optional mappings that fail
    }
  }

  return result;
}

/**
 * Create a transform function for common operations
 */
export const transforms = {
  uppercase: (value: unknown): string => String(value).toUpperCase(),
  lowercase: (value: unknown): string => String(value).toLowerCase(),
  trim: (value: unknown): string => String(value).trim(),
  reverse: (value: unknown): unknown => {
    const str = String(value);
    return str.split("").reverse().join("");
  },
  parseInt: (value: unknown): number => parseInt(String(value), 10),
  parseFloat: (value: unknown): number => parseFloat(String(value)),
  toJSON: (value: unknown): string => JSON.stringify(value),
  parseJSON: (value: unknown): unknown => JSON.parse(String(value)),
  encode: (value: unknown): string => btoa(String(value)),
  decode: (value: unknown): string => atob(String(value)),
  md5: async (value: unknown): Promise<string> => {
    // Would use crypto library in production
    return `md5(${String(value)})`;
  },
  concat:
    (...parts: unknown[]) =>
    (value: unknown): string => {
      return [String(value), ...parts.map(String)].join("");
    },
  replace:
    (search: string, replace: string) =>
    (value: unknown): string => {
      return String(value).replace(search, replace);
    },
  split:
    (separator: string) =>
    (value: unknown): string[] => {
      return String(value).split(separator);
    },
  join:
    (separator: string) =>
    (value: unknown): string => {
      const arr = Array.isArray(value) ? value : [value];
      return arr.map(String).join(separator);
    },
  length: (value: unknown): number => {
    if (typeof value === "string" || Array.isArray(value)) {
      return value.length;
    }
    return 0;
  },
  keys: (value: unknown): string[] => {
    if (typeof value === "object" && value !== null) {
      return Object.keys(value);
    }
    return [];
  },
  values: (value: unknown): unknown[] => {
    if (typeof value === "object" && value !== null) {
      return Object.values(value);
    }
    return [];
  },
  filter:
    (predicate: (v: unknown) => boolean) =>
    (value: unknown): unknown[] => {
      if (Array.isArray(value)) {
        return value.filter(predicate);
      }
      return [];
    },
  map:
    (fn: (v: unknown) => unknown) =>
    (value: unknown): unknown[] => {
      if (Array.isArray(value)) {
        return value.map(fn);
      }
      return [];
    },
};

/**
 * Evaluate a conditional expression
 */
export function evaluateCondition(
  condition: string,
  context: Record<string, unknown>
): boolean {
  try {
    // Simple safe expression evaluation - in production use a library like expr-eval
    const keys = Object.keys(context);
    const values = keys.map((k) => context[k]);
    const func = new Function(...keys, `return ${condition}`);
    return Boolean(func(...values));
  } catch {
    return false;
  }
}

/**
 * Build mapping configuration from simple format
 */
export function buildMappingConfig(
  simpleFormat: Record<string, string>
): DataMappingConfig {
  const mappings: FieldMapping[] = Object.entries(simpleFormat).map(
    ([target, source]) => ({
      source,
      target,
    })
  );

  return { mappings };
}

/**
 * Validate mapping configuration
 */
export function validateMappingConfig(config: DataMappingConfig): string[] {
  const errors: string[] = [];

  if (!Array.isArray(config.mappings)) {
    errors.push("Mappings must be an array");
    return errors;
  }

  for (let i = 0; i < config.mappings.length; i++) {
    const mapping = config.mappings[i];

    if (!mapping.source) {
      errors.push(`Mapping ${i}: source is required`);
    }

    if (!mapping.target) {
      errors.push(`Mapping ${i}: target is required`);
    }

    // Validate JSONPath format
    if (mapping.source && !isValidJSONPath(mapping.source)) {
      errors.push(`Mapping ${i}: invalid source JSONPath: ${mapping.source}`);
    }

    if (mapping.target && !isValidJSONPath(mapping.target)) {
      errors.push(`Mapping ${i}: invalid target JSONPath: ${mapping.target}`);
    }
  }

  return errors;
}

/**
 * Validate JSONPath format
 */
function isValidJSONPath(path: string): boolean {
  // Basic validation for JSONPath format
  if (path === "$") return true;
  if (path.startsWith("$.") || path.startsWith("steps.")) {
    return /^[\w$.[\]]+$/.test(path);
  }
  return false;
}
