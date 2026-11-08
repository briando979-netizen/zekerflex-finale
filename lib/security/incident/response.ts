import crypto from "crypto";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "detected" | "acknowledged" | "investigating" | "contained" | "resolved" | "closed";

export interface SecurityIncident {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectedAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  affectedSystems: string[];
  affectedUsers: number;
  rootCause?: string;
  mitigation?: string;
  timeline: TimelineEntry[];
  assignedTo?: string;
}

export interface TimelineEntry {
  timestamp: Date;
  action: string;
  actor: string;
  details: string;
}

export class IncidentResponseTeam {
  private incidents: Map<string, SecurityIncident> = new Map();
  private escalationChain: string[] = [];
  private onCallRotation: Map<string, string[]> = new Map();

  createIncident(
    type: string,
    title: string,
    description: string,
    severity: IncidentSeverity,
    affectedSystems: string[]
  ): SecurityIncident {
    const incident: SecurityIncident = {
      id: crypto.randomUUID(),
      type,
      title,
      description,
      severity,
      status: "detected",
      detectedAt: new Date(),
      affectedSystems,
      affectedUsers: 0,
      timeline: [
        {
          timestamp: new Date(),
          action: "incident_created",
          actor: "system",
          details: `${title}: ${description}`,
        },
      ],
    };

    this.incidents.set(incident.id, incident);
    this.alertOnCall(incident);
    return incident;
  }

  acknowledgeIncident(incidentId: string, acknowledgedBy: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.status = "acknowledged";
    incident.acknowledgedAt = new Date();
    incident.timeline.push({
      timestamp: new Date(),
      action: "incident_acknowledged",
      actor: acknowledgedBy,
      details: `Incident acknowledged by ${acknowledgedBy}`,
    });

    return true;
  }

  updateIncidentStatus(incidentId: string, status: IncidentStatus, notes: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.status = status;
    incident.timeline.push({
      timestamp: new Date(),
      action: `status_${status}`,
      actor: "system",
      details: notes,
    });

    if (status === "resolved") {
      incident.resolvedAt = new Date();
    }

    return true;
  }

  assignIncident(incidentId: string, assignedTo: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.assignedTo = assignedTo;
    incident.timeline.push({
      timestamp: new Date(),
      action: "assigned",
      actor: "system",
      details: `Incident assigned to ${assignedTo}`,
    });

    return true;
  }

  addTimelineEntry(incidentId: string, action: string, actor: string, details: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.timeline.push({
      timestamp: new Date(),
      action,
      actor,
      details,
    });

    return true;
  }

  private alertOnCall(incident: SecurityIncident): void {
    // Determine on-call engineer based on incident severity
    const currentOnCall = this.getOnCallEngineer(incident.severity);
    if (currentOnCall) {
      this.sendAlert(currentOnCall, incident);
    }
  }

  private getOnCallEngineer(severity: IncidentSeverity): string | null {
    // Return current on-call engineer; escalate if multiple are needed
    return null;
  }

  private sendAlert(engineer: string, incident: SecurityIncident): void {
    // Send alert via SMS, email, PagerDuty, Slack, etc.
  }

  getIncident(id: string): SecurityIncident | null {
    return this.incidents.get(id) ?? null;
  }

  getOpenIncidents(): SecurityIncident[] {
    return Array.from(this.incidents.values()).filter((i) => i.status !== "closed");
  }

  getIncidentsByStatus(status: IncidentStatus): SecurityIncident[] {
    return Array.from(this.incidents.values()).filter((i) => i.status === status);
  }

  getIncidentsBySeverity(severity: IncidentSeverity): SecurityIncident[] {
    return Array.from(this.incidents.values()).filter((i) => i.severity === severity);
  }

  closeIncident(incidentId: string, rootCause: string, mitigation: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.status = "closed";
    incident.rootCause = rootCause;
    incident.mitigation = mitigation;
    incident.timeline.push({
      timestamp: new Date(),
      action: "incident_closed",
      actor: "system",
      details: `Root cause: ${rootCause}. Mitigation: ${mitigation}`,
    });

    // Generate post-incident report
    this.generatePostIncidentReport(incident);

    return true;
  }

  private generatePostIncidentReport(incident: SecurityIncident): void {
    // Create detailed incident report
    const report = {
      incidentId: incident.id,
      summary: incident.title,
      timeline: incident.timeline,
      rootCause: incident.rootCause,
      mitigation: incident.mitigation,
      prevention: this.suggestPrevention(incident),
      lessons: this.extractLessons(incident),
    };

    // Send to team, store in knowledge base
  }

  private suggestPrevention(incident: SecurityIncident): string[] {
    // Based on incident type, suggest preventive measures
    return [];
  }

  private extractLessons(incident: SecurityIncident): string[] {
    // Extract lessons learned for team development
    return [];
  }

  setupOnCallRotation(engineers: string[], rotationDays: number = 7): void {
    // Set up on-call rotation
    const now = new Date();
    let current = 0;

    for (let i = 0; i < 365; i += rotationDays) {
      const weekStart = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + rotationDays * 24 * 60 * 60 * 1000);
      const key = `${weekStart.toISOString().split("T")[0]}`;

      this.onCallRotation.set(key, [engineers[current % engineers.length]]);
      current++;
    }
  }

  escalateIncident(incidentId: string): void {
    // Escalate to next level in incident management hierarchy
    const incident = this.incidents.get(incidentId);
    if (!incident) return;

    const escalationLevel = this.escalationChain.length > 0 ? this.escalationChain[0] : "management";

    incident.timeline.push({
      timestamp: new Date(),
      action: "escalated",
      actor: "system",
      details: `Escalated to ${escalationLevel}`,
    });
  }

  getIncidentStats(): {
    total: number;
    open: number;
    byStatus: Record<IncidentStatus, number>;
    bySeverity: Record<IncidentSeverity, number>;
    avgResolutionTime: number;
  } {
    const incidents = Array.from(this.incidents.values());
    const byStatus: Record<IncidentStatus, number> = {
      detected: 0,
      acknowledged: 0,
      investigating: 0,
      contained: 0,
      resolved: 0,
      closed: 0,
    };

    const bySeverity: Record<IncidentSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const incident of incidents) {
      byStatus[incident.status]++;
      bySeverity[incident.severity]++;
    }

    const resolvedIncidents = incidents.filter((i) => i.resolvedAt);
    const avgResolutionTime =
      resolvedIncidents.length > 0
        ? resolvedIncidents.reduce((sum, i) => {
            if (!i.detectedAt || !i.resolvedAt) return sum;
            return sum + (i.resolvedAt.getTime() - i.detectedAt.getTime());
          }, 0) / resolvedIncidents.length
        : 0;

    return {
      total: incidents.length,
      open: incidents.filter((i) => i.status !== "closed").length,
      byStatus,
      bySeverity,
      avgResolutionTime: Math.floor(avgResolutionTime / 1000 / 60), // in minutes
    };
  }
}

export const incidentResponseTeam = new IncidentResponseTeam();
