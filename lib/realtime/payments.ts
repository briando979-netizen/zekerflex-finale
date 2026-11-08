export interface PaymentUpdate {
  id: string;
  userId: string;
  type: "transaction" | "invoice" | "payout" | "fee";
  status: "pending" | "processing" | "completed" | "failed";
  amount: number;
  currency: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

const paymentUpdates = new Map<string, PaymentUpdate[]>();
const paymentListeners = new Map<string, Set<(update: PaymentUpdate) => void>>();

export function subscribePayments(userId: string, listener: (update: PaymentUpdate) => void) {
  if (!paymentListeners.has(userId)) {
    paymentListeners.set(userId, new Set());
  }
  paymentListeners.get(userId)?.add(listener);
  return () => paymentListeners.get(userId)?.delete(listener);
}

export function recordPaymentUpdate(userId: string, update: Omit<PaymentUpdate, "id" | "timestamp">) {
  const fullUpdate: PaymentUpdate = {
    ...update,
    id: `pay-${Date.now()}`,
    timestamp: new Date(),
  };

  const updates = paymentUpdates.get(userId) ?? [];
  updates.unshift(fullUpdate);
  if (updates.length > 5000) updates.pop();
  paymentUpdates.set(userId, updates);

  const listeners = paymentListeners.get(userId);
  if (listeners) {
    listeners.forEach((l) => l(fullUpdate));
  }

  return fullUpdate;
}

export function getPaymentHistory(userId: string, limit = 50): PaymentUpdate[] {
  return (paymentUpdates.get(userId) ?? []).slice(0, limit);
}

export interface BalanceInfo {
  available: number;
  pending: number;
  disputed: number;
  total: number;
  currency: string;
}

export function getBalance(userId: string, currency = "EUR"): BalanceInfo {
  const history = paymentUpdates.get(userId) ?? [];

  const completed = history
    .filter((p) => p.status === "completed" && p.currency === currency)
    .reduce((sum, p) => sum + (p.type === "payout" ? -p.amount : p.amount), 0);

  const pending = history
    .filter((p) => p.status === "pending" && p.currency === currency)
    .reduce((sum, p) => sum + p.amount, 0);

  const disputed = history
    .filter((p) => p.status === "failed" && p.currency === currency)
    .reduce((sum, p) => sum + p.amount, 0);

  return {
    available: Math.max(0, completed),
    pending,
    disputed,
    total: completed + pending,
    currency,
  };
}

export function getPendingTransactions(userId: string): PaymentUpdate[] {
  return (paymentUpdates.get(userId) ?? []).filter((p) => p.status === "pending" || p.status === "processing");
}

export function getPaymentStats(userId: string, days = 30) {
  const cutoff = new Date(Date.now() - days * 86400000);
  const history = (paymentUpdates.get(userId) ?? []).filter((p) => p.timestamp >= cutoff);

  return {
    transactionCount: history.length,
    totalIncome: history
      .filter((p) => p.status === "completed" && p.type !== "fee")
      .reduce((sum, p) => sum + p.amount, 0),
    totalFees: history
      .filter((p) => p.status === "completed" && p.type === "fee")
      .reduce((sum, p) => sum + p.amount, 0),
    completedPayouts: history
      .filter((p) => p.status === "completed" && p.type === "payout")
      .reduce((sum, p) => sum + p.amount, 0),
  };
}
