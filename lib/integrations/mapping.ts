import { z } from "zod";

const fieldMappingSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.enum(["direct", "transform", "aggregate"]),
  validation?: z.string(),
  defaultValue?: z.unknown(),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

interface TransformContext {
  row: Record<string, unknown>;
  allData: Record<string, unknown>[];
  index: number;
}

export class DataMapper {
  private mappings: FieldMapping[];
  private validators: Map<string, (value: unknown) => boolean> = new Map();

  constructor(mappings: FieldMapping[]) {
    this.mappings = mappings;
  }

  addValidator(field: string, validator: (value: unknown) => boolean) {
    this.validators.set(field, validator);
  }

  mapRow(row: Record<string, unknown>, context?: Partial<TransformContext>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const mapping of this.mappings) {
      try {
        let value = row[mapping.source];

        if (value === undefined || value === null) {
          value = mapping.defaultValue;
        }

        if (mapping.type === "transform" && mapping.validation) {
          value = this.executeTransform(mapping.validation, value, context?.row || row);
        }

        if (this.validators.has(mapping.target)) {
          const isValid = this.validators.get(mapping.target)!(value);
          if (!isValid) {
            throw new Error(`Validation failed for field ${mapping.target}`);
          }
        }

        result[mapping.target] = value;
      } catch (error) {
        result[mapping.target] = mapping.defaultValue;
      }
    }

    return result;
  }

  mapBatch(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((row, index) => this.mapRow(row, { index, allData: rows }));
  }

  private executeTransform(
    transformCode: string,
    value: unknown,
    context: Record<string, unknown>
  ): unknown {
    try {
      const fn = new Function("value", "context", `return ${transformCode}`);
      return fn(value, context);
    } catch {
      return value;
    }
  }
}

export async function validateMapping(
  sourceData: Record<string, unknown>,
  mapper: DataMapper
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  try {
    const result = mapper.mapRow(sourceData);
    if (!result || typeof result !== "object") {
      errors.push("Mapped result is invalid");
    }
  } catch (error) {
    errors.push(`Mapping error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { valid: errors.length === 0, errors };
}
