/**
 * Attribute-Based Access Control (ABAC)
 *
 * Fine-grained access control based on user/resource attributes.
 * Supports complex rule evaluation with operators: eq, ne, in, notIn, lt, lte, gt, gte, contains
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export interface ABACRule {
  attribute: string;
  operator: "eq" | "ne" | "in" | "notIn" | "lt" | "lte" | "gt" | "gte" | "contains" | "matches";
  value?: any;
  values?: any[];
}

export interface ABACContext {
  userId: string;
  department?: string;
  location?: string;
  role?: string;
  attributes?: Record<string, any>;
  resourceType?: string;
  resourceId?: string;
  resourceAttributes?: Record<string, any>;
}

/**
 * Evaluate a single ABAC rule against a context
 */
function evaluateRule(rule: ABACRule, context: ABACContext): boolean {
  const contextValue = context.attributes?.[rule.attribute];

  switch (rule.operator) {
    case "eq":
      return contextValue === rule.value;

    case "ne":
      return contextValue !== rule.value;

    case "in":
      return rule.values?.includes(contextValue) ?? false;

    case "notIn":
      return !(rule.values?.includes(contextValue) ?? false);

    case "lt":
      return Number(contextValue) < Number(rule.value);

    case "lte":
      return Number(contextValue) <= Number(rule.value);

    case "gt":
      return Number(contextValue) > Number(rule.value);

    case "gte":
      return Number(contextValue) >= Number(rule.value);

    case "contains":
      return String(contextValue).includes(String(rule.value));

    case "matches":
      try {
        const regex = new RegExp(rule.value);
        return regex.test(String(contextValue));
      } catch {
        return false;
      }

    default:
      return false;
  }
}

/**
 * Evaluate all rules in a policy (AND logic)
 */
function evaluatePolicy(rules: ABACRule[], context: ABACContext): boolean {
  return rules.every(rule => evaluateRule(rule, context));
}

/**
 * Check if an access should be allowed based on attribute policies
 */
export async function evaluateABACPolicies(
  tenantId: string,
  context: ABACContext,
  resourceType: string
): Promise<{
  allowed: boolean;
  reason?: string;
  matchedPolicies: string[];
}> {
  const policies = await prisma.attributePolicy.findMany({
    where: {
      tenantId,
      isActive: true,
      resources: {
        hasSome: [`${resourceType}:*`, `${resourceType}:read`, `${resourceType}:write`]
      }
    }
  });

  const matchedPolicies: string[] = [];
  let hasAllow = false;
  let hasDeny = false;

  for (const policy of policies) {
    const rules = (policy.rules as ABACRule[]) || [];
    const matches = evaluatePolicy(rules, context);

    if (matches) {
      matchedPolicies.push(policy.name);

      if (policy.effect === "allow") {
        hasAllow = true;
      } else if (policy.effect === "deny") {
        hasDeny = true;
        // Deny wins immediately
        return {
          allowed: false,
          reason: `Denied by policy: ${policy.name}`,
          matchedPolicies
        };
      }
    }
  }

  return {
    allowed: hasAllow,
    reason: hasAllow ? undefined : "No allow policies matched",
    matchedPolicies
  };
}

/**
 * Create an attribute policy
 */
export async function createAttributePolicy(
  tenantId: string,
  name: string,
  rules: ABACRule[],
  options?: {
    description?: string;
    effect?: "allow" | "deny";
    resources?: string[];
  }
) {
  const existing = await prisma.attributePolicy.findUnique({
    where: { tenantId_name: { tenantId, name } }
  });

  if (existing) {
    throw new AppError("PolicyExists", "Policy with this name already exists", 409);
  }

  return prisma.attributePolicy.create({
    data: {
      tenantId,
      name,
      description: options?.description,
      rules: rules as any,
      effect: options?.effect || "allow",
      resources: options?.resources || [],
      isActive: true
    }
  });
}

/**
 * Update an attribute policy
 */
export async function updateAttributePolicy(
  policyId: string,
  updates: {
    name?: string;
    description?: string;
    rules?: ABACRule[];
    effect?: "allow" | "deny";
    resources?: string[];
    isActive?: boolean;
  }
) {
  return prisma.attributePolicy.update({
    where: { id: policyId },
    data: {
      ...updates,
      rules: updates.rules as any
    }
  });
}

/**
 * Get all policies for a tenant
 */
export async function getTenantPolicies(tenantId: string) {
  return prisma.attributePolicy.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" }
  });
}

/**
 * Example: Create common department-based policies
 */
export async function setupDepartmentPolicies(tenantId: string) {
  // IT department can access all resources
  await createAttributePolicy(
    tenantId,
    "IT Full Access",
    [{ attribute: "department", operator: "eq", value: "IT" }],
    {
      description: "IT department has full access",
      effect: "allow",
      resources: ["*"]
    }
  ).catch(() => {}); // Ignore if already exists

  // Finance can access invoices
  await createAttributePolicy(
    tenantId,
    "Finance Invoice Access",
    [{ attribute: "department", operator: "eq", value: "Finance" }],
    {
      description: "Finance department can access invoices",
      effect: "allow",
      resources: ["invoices:*"]
    }
  ).catch(() => {});

  // Location-based access
  await createAttributePolicy(
    tenantId,
    "Amsterdam Shift Access",
    [{ attribute: "location", operator: "in", values: ["Amsterdam", "Amsterdam North"] }],
    {
      description: "Users in Amsterdam can access Amsterdam shifts",
      effect: "allow",
      resources: ["shifts:read"]
    }
  ).catch(() => {});
}
