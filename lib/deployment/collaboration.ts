export interface DeploymentComment {
  id: string;
  deploymentId: string;
  author: string;
  text: string;
  createdAt: Date;
  updatedAt?: Date;
  resolved: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "developer" | "viewer";
  joinedAt: Date;
}

export interface NotificationPreference {
  userId: string;
  channels: Array<"email" | "slack" | "dashboard">;
  alertTypes: Array<"deployment" | "alert" | "comment" | "all">;
}

const comments: Map<string, DeploymentComment> = new Map();
const teamMembers: Map<string, TeamMember> = new Map();
const preferences: Map<string, NotificationPreference> = new Map();
let commentIdCounter = 1;

export function addComment(
  deploymentId: string,
  author: string,
  text: string
): DeploymentComment {
  const id = `comment-${commentIdCounter++}`;

  const comment: DeploymentComment = {
    id,
    deploymentId,
    author,
    text,
    createdAt: new Date(),
    resolved: false,
  };

  comments.set(id, comment);
  return comment;
}

export function getDeploymentComments(deploymentId: string): DeploymentComment[] {
  return Array.from(comments.values())
    .filter(c => c.deploymentId === deploymentId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function updateComment(id: string, text: string): DeploymentComment | null {
  const comment = comments.get(id);
  if (!comment) return null;

  comment.text = text;
  comment.updatedAt = new Date();
  return comment;
}

export function resolveComment(id: string): DeploymentComment | null {
  const comment = comments.get(id);
  if (!comment) return null;

  comment.resolved = true;
  return comment;
}

export function deleteComment(id: string): boolean {
  return comments.delete(id);
}

export function addTeamMember(
  name: string,
  email: string,
  role: "admin" | "developer" | "viewer" = "developer"
): TeamMember {
  const id = `team-${Date.now()}`;

  const member: TeamMember = {
    id,
    name,
    email,
    role,
    joinedAt: new Date(),
  };

  teamMembers.set(id, member);
  return member;
}

export function getTeamMembers(): TeamMember[] {
  return Array.from(teamMembers.values());
}

export function updateMemberRole(id: string, role: string): TeamMember | null {
  const member = teamMembers.get(id);
  if (!member) return null;

  member.role = role as any;
  return member;
}

export function removeTeamMember(id: string): boolean {
  return teamMembers.delete(id);
}

export function setNotificationPreference(
  userId: string,
  channels: Array<"email" | "slack" | "dashboard">,
  alertTypes: Array<"deployment" | "alert" | "comment" | "all">
): NotificationPreference {
  const pref: NotificationPreference = {
    userId,
    channels,
    alertTypes,
  };

  preferences.set(userId, pref);
  return pref;
}

export function getNotificationPreference(userId: string): NotificationPreference | null {
  return preferences.get(userId) || null;
}

export function getTeamStats() {
  return {
    totalMembers: teamMembers.size,
    admins: Array.from(teamMembers.values()).filter(m => m.role === "admin").length,
    developers: Array.from(teamMembers.values()).filter(m => m.role === "developer").length,
    viewers: Array.from(teamMembers.values()).filter(m => m.role === "viewer").length,
    totalComments: comments.size,
    unresolvedComments: Array.from(comments.values()).filter(c => !c.resolved).length,
  };
}
