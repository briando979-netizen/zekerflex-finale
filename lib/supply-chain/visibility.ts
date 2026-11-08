import { prisma } from '@/lib/prisma';

export async function endToEndTracking(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shipment: { include: { events: true } } },
  });

  if (!order) throw new Error('Order not found');

  return {
    orderId,
    status: order.status,
    timeline: [
      { stage: 'Ordered', time: order.createdAt, completed: true },
      { stage: 'Processing', time: order.processedAt, completed: !!order.processedAt },
      { stage: 'Shipped', time: order.shipment?.shippedAt, completed: !!order.shipment?.shippedAt },
      { stage: 'In Transit', time: order.shipment?.events[0]?.timestamp, completed: order.shipment?.status === 'IN_TRANSIT' },
      { stage: 'Out for Delivery', time: order.shipment?.events[1]?.timestamp, completed: order.shipment?.status === 'OUT_FOR_DELIVERY' },
      { stage: 'Delivered', time: order.shipment?.actualDelivery, completed: order.status === 'DELIVERED' },
    ],
    currentLocation: order.shipment?.events[0]?.location,
    eta: order.shipment?.estimatedDelivery,
    exceptions: await getOrderExceptions(orderId),
  };
}

export async function transparencyDashboard() {
  const orders = await prisma.order.findMany({ take: 100 });
  const shipments = await prisma.shipment.findMany({ take: 100 });

  const summary = {
    totalOrders: orders.length,
    ordersByStatus: summarizeByStatus(orders),
    shipmentsByStatus: summarizeByStatus(shipments),
    onTimePercentage: (orders.filter(o => !o.shipment?.delayedFlag).length / orders.length) * 100,
    avgDeliveryTime: calculateAvgDeliveryTime(orders),
    exceptions: await getActiveExceptions(),
  };

  return summary;
}

export async function setupAlerts(orderId: string, alertTypes: string[]) {
  const alerts: any[] = [];

  for (const type of alertTypes) {
    switch (type) {
      case 'DELAY':
        alerts.push({
          type: 'DELAY',
          threshold: 24,
          action: 'notify_customer',
        });
        break;
      case 'EXCEPTION':
        alerts.push({
          type: 'EXCEPTION',
          threshold: 0,
          action: 'escalate_to_manager',
        });
        break;
      case 'DELIVERY_WINDOW':
        alerts.push({
          type: 'DELIVERY_WINDOW',
          threshold: 2,
          action: 'notify_customer',
        });
        break;
    }
  }

  await prisma.alert.createMany({
    data: alerts.map(a => ({ orderId, ...a })),
  });

  return alerts;
}

export async function realTimeUpdates(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shipment: { include: { events: true } } },
  });

  return {
    orderId,
    lastUpdate: order?.shipment?.events[0]?.timestamp,
    status: order?.status,
    location: order?.shipment?.events[0]?.location,
    nextCheckpoint: getNextCheckpoint(order?.shipment?.status),
  };
}

function summarizeByStatus(items: any[]) {
  const summary: Record<string, number> = {};

  items.forEach(item => {
    const status = item.status || 'UNKNOWN';
    summary[status] = (summary[status] || 0) + 1;
  });

  return summary;
}

function calculateAvgDeliveryTime(orders: any[]) {
  const delivered = orders.filter(o => o.shipment?.actualDelivery && o.createdAt);
  if (delivered.length === 0) return null;

  const totalDays = delivered.reduce((sum, o) => {
    const days = (o.shipment.actualDelivery.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return sum + days;
  }, 0);

  return Math.round((totalDays / delivered.length) * 10) / 10;
}

async function getOrderExceptions(orderId: string) {
  return prisma.exception.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
}

async function getActiveExceptions() {
  return prisma.exception.findMany({
    where: { resolved: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

function getNextCheckpoint(status: string | null) {
  const checkpoints: Record<string, string> = {
    'PROCESSING': 'Warehouse departure',
    'IN_TRANSIT': 'Local sorting facility',
    'OUT_FOR_DELIVERY': 'Your address',
    'DELIVERED': 'Delivered',
  };

  return checkpoints[status || ''] || 'Unknown';
}
