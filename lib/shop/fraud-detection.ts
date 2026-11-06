// Fraud detection for shop orders

export interface FraudSignal {
  name: string;
  riskScore: number; // 0-100
  description: string;
  action: "allow" | "review" | "block";
}

export interface FraudAssessment {
  customerId: string;
  orderId: string;
  overallRisk: number; // 0-100
  signals: FraudSignal[];
  recommendation: "approve" | "review" | "block";
}

export const FRAUD_RULES = [
  {
    name: "high_value_first_order",
    check: (order: any) => order.isFirstOrder && order.totalCents > 50000,
    score: 20,
    description: "Hoge waarde eerste bestelling",
  },
  {
    name: "rapid_repurchase",
    check: (order: any) => order.timeSinceLastOrder < 3600, // 1 uur
    score: 15,
    description: "Meerdere bestellingen in korte tijd",
  },
  {
    name: "unusual_quantity",
    check: (order: any) => order.items.some((i: any) => i.quantity > 10),
    score: 25,
    description: "Ongewone aantallen",
  },
  {
    name: "multiple_addresses",
    check: (order: any) => order.shippingAddress !== order.billingAddress,
    score: 10,
    description: "Verzend- en factuuradressen verschillen",
  },
  {
    name: "new_payment_method",
    check: (order: any) => order.paymentMethod?.isNew,
    score: 15,
    description: "Nieuwe betaalmethode",
  },
];

export function assessOrderFraudRisk(order: any): FraudAssessment {
  const signals: FraudSignal[] = [];

  for (const rule of FRAUD_RULES) {
    if (rule.check(order)) {
      signals.push({
        name: rule.name,
        riskScore: rule.score,
        description: rule.description,
        action: rule.score > 20 ? "review" : "allow",
      });
    }
  }

  const overallRisk = signals.reduce((sum, s) => sum + s.riskScore, 0);
  const maxRisk = Math.min(100, overallRisk);

  return {
    customerId: order.customerId,
    orderId: order.id,
    overallRisk: maxRisk,
    signals,
    recommendation: maxRisk > 50 ? "block" : maxRisk > 30 ? "review" : "approve",
  };
}

export function shouldAllowOrder(assessment: FraudAssessment): boolean {
  return assessment.recommendation === "approve" || assessment.recommendation === "review";
}
