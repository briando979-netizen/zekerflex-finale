// Shared types + helpers for the chat UI (dock + full page).

export interface ChatUser {
  userId: string;
  name: string;
  role: "freelancer" | "employer" | "admin" | "support";
  meta: string;
}

export interface Presence {
  online: boolean;
  lastSeen: string | null;
}

export interface Attachment {
  mediaId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
}

export interface CallInfo {
  mode: "audio" | "video" | "screen";
  status: "started" | "ended" | "missed" | "declined";
  durationSec?: number;
}

export interface Msg {
  id: string;
  from: string;
  at: string;
  text: string;
  kind: "text" | "system" | "voice" | "file" | "image" | "location" | "call";
  attachment?: Attachment;
  location?: { lat: number; lng: number; label?: string };
  call?: CallInfo;
  replyTo?: { id: string; from: string; excerpt: string; kind: Msg["kind"] };
  auto?: boolean;
  readByOthers?: boolean;
  pending?: boolean;
}

export interface ThreadRow {
  id: string;
  kind: "direct" | "support" | "group";
  participants: string[];
  subject: string | null;
  title?: string | null;
  communityId?: string | null;
  shiftTitle: string | null;
  branch: string | null;
  lastMessage: { from: string; text: string; at: string } | null;
  lastMessageAt: string;
  unread: number;
}

export const ROLE_COLOR: Record<string, string> = {
  freelancer: "#0E5C4A",
  employer: "#1D4ED8",
  admin: "#0C0E12",
  support: "#0C0E12",
};

export const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Vandaag";
  if (d.toDateString() === y.toDateString()) return "Gisteren";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function lastSeenLabel(p: Presence | undefined): string {
  if (!p) return "";
  if (p.online) return "online";
  if (!p.lastSeen) return "";
  const d = new Date(p.lastSeen);
  const now = new Date();
  const time = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `laatst gezien om ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `laatst gezien gisteren`;
  return `laatst gezien ${d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`;
}

export function avatarSrc(userId: string, avatars: Record<string, string>): string | null {
  return avatars[userId] ? `/api/profile/${userId}/avatar` : null;
}
