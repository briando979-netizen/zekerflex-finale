// Omnichannel inventory and order orchestration

export interface Channel {
  id: string;
  name: string;
  type: "website" | "marketplace" | "social" | "retail" | "wholesale";
  enabled: boolean;
  inventory_sync: boolean;
  order_sync: boolean;
  config: Record<string, any>;
}

export interface ChannelListing {
  id: string;
  productId: string;
  channelId: string;
  externalId: string; // SKU on marketplace
  price: number; // cents (may differ per channel)
  inventory: number;
  status: "active" | "paused" | "archived";
  lastSync: Date;
}

export interface OmnichanelOrder {
  id: string;
  externalOrderId?: string; // order ID on marketplace
  channel: string;
  items: OrderItem[];
  status: "pending" | "processing" | "shipped" | "delivered";
  shippingAddress: Address;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number; // cents
}

export interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export const SUPPORTED_CHANNELS = [
  { id: "amazon", name: "Amazon" },
  { id: "ebay", name: "eBay" },
  { id: "etsy", name: "Etsy" },
  { id: "shopee", name: "Shopee" },
  { id: "lazada", name: "Lazada" },
  { id: "instagram", name: "Instagram Shopping" },
  { id: "facebook", name: "Facebook Shop" },
  { id: "tiktok", name: "TikTok Shop" },
  { id: "website", name: "Your Website" },
];

export async function connectChannel(
  type: string,
  credentials: Record<string, string>
): Promise<Channel> {
  return {
    id: `ch_${Date.now()}`,
    name: type,
    type: type as any,
    enabled: true,
    inventory_sync: true,
    order_sync: true,
    config: credentials,
  };
}

export async function syncChannelInventory(channelId: string): Promise<void> {
  // TODO: Push inventory to all listings on this channel
}

export async function syncAllChannelInventory(): Promise<void> {
  // TODO: Sync inventory across all channels
}

export async function consolidateChannelOrders(): Promise<OmnichanelOrder[]> {
  // TODO: Pull orders from all channels into unified queue
  return [];
}

export async function getChannelMetrics(channelId: string): Promise<{
  orders: number;
  revenue: number;
  conversionRate: number;
}> {
  return { orders: 0, revenue: 0, conversionRate: 0 };
}
