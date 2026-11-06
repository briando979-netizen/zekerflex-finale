// Shipping integrations and tracking

export type ShippingProvider = "postnl" | "dpd" | "tnt" | "ups" | "fedex";

export interface ShippingMethod {
  id: string;
  name: string;
  provider: ShippingProvider;
  basePriceCents: number;
  estimatedDays: number;
  maxWeightKg?: number;
  insurance?: boolean;
}

export interface Shipment {
  id: string;
  orderId: string;
  provider: ShippingProvider;
  trackingNumber: string;
  method: string;
  status: "pending" | "picked" | "in_transit" | "out_for_delivery" | "delivered" | "failed";
  shippedAt?: Date;
  deliveredAt?: Date;
  carrier?: string;
}

export const SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: "standard",
    name: "Standaard (3-5 werkdagen)",
    provider: "postnl",
    basePriceCents: 0, // Gratis
    estimatedDays: 5,
  },
  {
    id: "express",
    name: "Express (1-2 werkdagen)",
    provider: "dpd",
    basePriceCents: 995,
    estimatedDays: 2,
  },
  {
    id: "international",
    name: "Internationaal",
    provider: "tnt",
    basePriceCents: 2995,
    estimatedDays: 10,
  },
];

export async function getShippingMethods(weight: number, country: string): Promise<ShippingMethod[]> {
  // TODO: Filter by weight and country
  return SHIPPING_METHODS;
}

export async function createShipment(orderId: string, method: ShippingMethod): Promise<Shipment> {
  // TODO: Call carrier API to create label and get tracking
  return {
    id: `ship_${Date.now()}`,
    orderId,
    provider: method.provider,
    trackingNumber: `${method.provider.toUpperCase()}${Date.now()}`,
    method: method.name,
    status: "pending",
  };
}

export async function trackShipment(trackingNumber: string): Promise<Shipment | null> {
  // TODO: Call carrier API to get status
  return null;
}

export function getDeliveryEstimate(shipment: Shipment): Date | null {
  if (!shipment.shippedAt) return null;
  const days = SHIPPING_METHODS.find((m) => m.name === shipment.method)?.estimatedDays || 5;
  const estimate = new Date(shipment.shippedAt);
  estimate.setDate(estimate.getDate() + days);
  return estimate;
}
