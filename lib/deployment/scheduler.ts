export interface ScheduledDeployment {
  id: string;
  branch: string;
  scheduledFor: Date;
  status: "scheduled" | "in-progress" | "completed" | "failed" | "cancelled";
  priority: "low" | "medium" | "high";
  createdBy: string;
  createdAt: Date;
  executedAt?: Date;
  failureReason?: string;
}

const deploymentSchedule: Map<string, ScheduledDeployment> = new Map();
let idCounter = 1;

export function scheduleDeployment(
  branch: string,
  scheduledFor: Date,
  priority: "low" | "medium" | "high" = "medium",
  createdBy: string = "system"
): ScheduledDeployment {
  const id = `deploy-${idCounter++}`;
  const deployment: ScheduledDeployment = {
    id,
    branch,
    scheduledFor,
    status: "scheduled",
    priority,
    createdBy,
    createdAt: new Date(),
  };

  deploymentSchedule.set(id, deployment);
  return deployment;
}

export function getScheduledDeployments(
  status?: ScheduledDeployment["status"]
): ScheduledDeployment[] {
  let deployments = Array.from(deploymentSchedule.values());

  if (status) {
    deployments = deployments.filter(d => d.status === status);
  }

  return deployments.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

export function updateDeploymentStatus(
  id: string,
  status: ScheduledDeployment["status"],
  failureReason?: string
): ScheduledDeployment | null {
  const deployment = deploymentSchedule.get(id);

  if (!deployment) return null;

  deployment.status = status;
  if (status === "in-progress") {
    deployment.executedAt = new Date();
  }
  if (failureReason) {
    deployment.failureReason = failureReason;
  }

  return deployment;
}

export function cancelDeployment(id: string): ScheduledDeployment | null {
  const deployment = deploymentSchedule.get(id);

  if (!deployment) return null;

  deployment.status = "cancelled";
  return deployment;
}

export function getNextScheduledDeployment(): ScheduledDeployment | null {
  const scheduled = getScheduledDeployments("scheduled");
  if (scheduled.length === 0) return null;

  const now = new Date();
  for (const deployment of scheduled) {
    if (deployment.scheduledFor <= now) {
      return deployment;
    }
  }

  return null;
}

export function rescheduleDeployment(
  id: string,
  newTime: Date
): ScheduledDeployment | null {
  const deployment = deploymentSchedule.get(id);

  if (!deployment || deployment.status !== "scheduled") return null;

  deployment.scheduledFor = newTime;
  return deployment;
}

export function getDeploymentsByBranch(branch: string): ScheduledDeployment[] {
  return Array.from(deploymentSchedule.values())
    .filter(d => d.branch === branch)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
