export interface DeploymentTemplate {
  id: string;
  name: string;
  description: string;
  branch: string;
  environment: "development" | "staging" | "production";
  steps: DeploymentStep[];
  preChecks: HealthCheck[];
  postChecks: HealthCheck[];
  rollbackEnabled: boolean;
  notifyOnCompletion: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
  usageCount: number;
}

export interface DeploymentStep {
  id: string;
  name: string;
  command: string;
  timeout: number;
  retries: number;
  continueOnFailure: boolean;
  order: number;
}

export interface HealthCheck {
  id: string;
  name: string;
  endpoint: string;
  expectedStatus: number;
  timeout: number;
}

const templates: Map<string, DeploymentTemplate> = new Map();
let templateIdCounter = 1;

export function createTemplate(
  name: string,
  description: string,
  branch: string,
  environment: "development" | "staging" | "production",
  createdBy: string
): DeploymentTemplate {
  const id = `template-${templateIdCounter++}`;

  const template: DeploymentTemplate = {
    id,
    name,
    description,
    branch,
    environment,
    steps: [],
    preChecks: [],
    postChecks: [],
    rollbackEnabled: true,
    notifyOnCompletion: true,
    createdBy,
    createdAt: new Date(),
    usageCount: 0,
  };

  templates.set(id, template);
  return template;
}

export function getTemplate(id: string): DeploymentTemplate | null {
  return templates.get(id) || null;
}

export function listTemplates(environment?: string): DeploymentTemplate[] {
  let result = Array.from(templates.values());

  if (environment) {
    result = result.filter(t => t.environment === environment);
  }

  return result.sort((a, b) => b.usageCount - a.usageCount);
}

export function addStep(
  templateId: string,
  name: string,
  command: string,
  timeout: number = 300000,
  retries: number = 3,
  order?: number
): DeploymentTemplate | null {
  const template = templates.get(templateId);
  if (!template) return null;

  const step: DeploymentStep = {
    id: `step-${Date.now()}`,
    name,
    command,
    timeout,
    retries,
    continueOnFailure: false,
    order: order ?? template.steps.length,
  };

  template.steps.push(step);
  return template;
}

export function addPreCheck(
  templateId: string,
  name: string,
  endpoint: string,
  expectedStatus: number = 200
): DeploymentTemplate | null {
  const template = templates.get(templateId);
  if (!template) return null;

  const check: HealthCheck = {
    id: `check-${Date.now()}`,
    name,
    endpoint,
    expectedStatus,
    timeout: 10000,
  };

  template.preChecks.push(check);
  return template;
}

export function addPostCheck(
  templateId: string,
  name: string,
  endpoint: string,
  expectedStatus: number = 200
): DeploymentTemplate | null {
  const template = templates.get(templateId);
  if (!template) return null;

  const check: HealthCheck = {
    id: `check-${Date.now()}`,
    name,
    endpoint,
    expectedStatus,
    timeout: 10000,
  };

  template.postChecks.push(check);
  return template;
}

export function updateTemplate(id: string, updates: Partial<DeploymentTemplate>): DeploymentTemplate | null {
  const template = templates.get(id);
  if (!template) return null;

  Object.assign(template, updates, { updatedAt: new Date() });
  return template;
}

export function incrementUsageCount(id: string): void {
  const template = templates.get(id);
  if (template) {
    template.usageCount++;
  }
}

export function deleteTemplate(id: string): boolean {
  return templates.delete(id);
}

export function cloneTemplate(id: string, newName: string, clonedBy: string): DeploymentTemplate | null {
  const original = templates.get(id);
  if (!original) return null;

  const cloned = createTemplate(
    newName,
    original.description,
    original.branch,
    original.environment,
    clonedBy
  );

  cloned.steps = [...original.steps];
  cloned.preChecks = [...original.preChecks];
  cloned.postChecks = [...original.postChecks];
  cloned.rollbackEnabled = original.rollbackEnabled;
  cloned.notifyOnCompletion = original.notifyOnCompletion;

  return cloned;
}

export function getPopularTemplates(limit: number = 10): DeploymentTemplate[] {
  return Array.from(templates.values())
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
}
