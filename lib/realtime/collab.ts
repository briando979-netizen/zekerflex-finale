export interface DocumentChange {
  id: string;
  userId: string;
  timestamp: Date;
  op: "insert" | "delete" | "replace";
  path: string[];
  value?: unknown;
  length?: number;
}

export interface DocumentSession {
  docId: string;
  users: Map<string, { cursor: number; color: string }>;
  changes: DocumentChange[];
  version: number;
}

const sessions = new Map<string, DocumentSession>();
const changeListeners = new Map<string, Set<(change: DocumentChange) => void>>();

export function createSession(docId: string): DocumentSession {
  const session: DocumentSession = {
    docId,
    users: new Map(),
    changes: [],
    version: 0,
  };
  sessions.set(docId, session);
  return session;
}

export function subscribeChanges(docId: string, listener: (change: DocumentChange) => void) {
  if (!changeListeners.has(docId)) {
    changeListeners.set(docId, new Set());
  }
  changeListeners.get(docId)?.add(listener);
  return () => changeListeners.get(docId)?.delete(listener);
}

export function applyChange(docId: string, change: Omit<DocumentChange, "id" | "timestamp">) {
  const session = sessions.get(docId);
  if (!session) return;

  const fullChange: DocumentChange = {
    ...change,
    id: `chg-${Date.now()}`,
    timestamp: new Date(),
  };

  session.changes.push(fullChange);
  session.version++;

  if (session.changes.length > 50000) {
    session.changes = session.changes.slice(-10000);
  }

  const listeners = changeListeners.get(docId);
  if (listeners) {
    listeners.forEach((l) => l(fullChange));
  }
}

export function updateCursor(docId: string, userId: string, position: number) {
  const session = sessions.get(docId);
  if (!session) return;

  let user = session.users.get(userId);
  if (!user) {
    user = { cursor: position, color: generateColor() };
    session.users.set(userId, user);
  } else {
    user.cursor = position;
  }

  const listeners = changeListeners.get(docId);
  if (listeners) {
    listeners.forEach((l) =>
      l({
        id: `cur-${Date.now()}`,
        userId,
        timestamp: new Date(),
        op: "insert",
        path: ["cursor"],
        value: position,
      })
    );
  }
}

export function removeUser(docId: string, userId: string) {
  const session = sessions.get(docId);
  if (session) {
    session.users.delete(userId);
  }
}

export function getSession(docId: string): DocumentSession | undefined {
  return sessions.get(docId);
}

export function mergeChanges(changes: DocumentChange[]): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  changes.forEach((change) => {
    const { op, path, value, length } = change;
    let current = state;

    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!current[key as any]) current[key as any] = {};
      current = current[key as any] as any;
    }

    const lastKey = path[path.length - 1];

    switch (op) {
      case "insert":
        current[lastKey as any] = value;
        break;
      case "delete":
        delete current[lastKey as any];
        break;
      case "replace":
        current[lastKey as any] = value;
        break;
    }
  });

  return state;
}

function generateColor(): string {
  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F"];
  return colors[Math.floor(Math.random() * colors.length)];
}
