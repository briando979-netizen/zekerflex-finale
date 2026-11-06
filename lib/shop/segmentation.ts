// Customer segmentation for marketing

export interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  criteria: SegmentCriteria;
  memberCount: number;
  createdAt: Date;
}

export interface SegmentCriteria {
  totalSpent?: { min?: number; max?: number }; // cents
  orderCount?: { min?: number; max?: number };
  lastOrderDays?: { max?: number }; // days since last order
  subscription?: boolean;
  averageOrderValue?: { min?: number; max?: number };
  riskScore?: { max?: number };
}

export const PREDEFINED_SEGMENTS = [
  {
    id: "vip",
    name: "VIP Customers",
    criteria: { totalSpent: { min: 500000 }, orderCount: { min: 10 } },
  },
  {
    id: "at_risk",
    name: "At Risk (Inactive)",
    criteria: { lastOrderDays: { max: 90 } },
  },
  {
    id: "high_value",
    name: "High Value",
    criteria: { averageOrderValue: { min: 50000 } },
  },
  {
    id: "new_customers",
    name: "New Customers",
    criteria: { orderCount: { max: 1 } },
  },
  {
    id: "subscribers",
    name: "Subscription Active",
    criteria: { subscription: true },
  },
];

export async function createSegment(data: Partial<CustomerSegment>): Promise<CustomerSegment> {
  return {
    id: `segment_${Date.now()}`,
    name: data.name || "",
    description: data.description || "",
    criteria: data.criteria || {},
    memberCount: 0,
    createdAt: new Date(),
    ...data,
  };
}

export async function getSegmentMembers(segmentId: string): Promise<string[]> {
  // TODO: Query database based on criteria
  return [];
}

export async function updateSegmentMembership(segmentId: string): Promise<void> {
  // TODO: Recalculate segment membership based on criteria
}
