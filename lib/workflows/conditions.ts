import { ConditionConfig, Condition } from "./types";

export class ConditionEvaluator {
  static evaluate(config: ConditionConfig, data: Record<string, unknown>): boolean {
    const results = config.conditions.map((cond) => this.evaluateCondition(cond, data));

    if (config.operator === "and") {
      return results.every((r) => r);
    } else if (config.operator === "or") {
      return results.some((r) => r);
    }

    return false;
  }

  private static evaluateCondition(condition: Condition, data: Record<string, unknown>): boolean {
    const fieldValue = data[condition.field];

    switch (condition.operator) {
      case "eq":
        return fieldValue === condition.value;

      case "neq":
        return fieldValue !== condition.value;

      case "gt":
        return (fieldValue as number) > (condition.value as number);

      case "lt":
        return (fieldValue as number) < (condition.value as number);

      case "gte":
        return (fieldValue as number) >= (condition.value as number);

      case "lte":
        return (fieldValue as number) <= (condition.value as number);

      case "contains":
        return String(fieldValue).includes(String(condition.value));

      case "matches": {
        const regex = new RegExp(String(condition.value));
        return regex.test(String(fieldValue));
      }

      default:
        return false;
    }
  }
}

export function validateCondition(condition: Condition): boolean {
  if (!condition.field || !condition.operator) {
    return false;
  }

  const validOperators = ["eq", "neq", "gt", "lt", "gte", "lte", "contains", "matches"];
  return validOperators.includes(condition.operator);
}

export function combineConditions(conditions: Condition[], operator: "and" | "or"): ConditionConfig {
  return {
    operator,
    conditions,
  };
}
