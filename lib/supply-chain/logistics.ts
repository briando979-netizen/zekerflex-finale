import { prisma } from '@/lib/prisma';

export async function optimizeRouting(shipmentId: string, stops: Array<{ lat: number; lng: number }>) {
  const distances = calculateDistances(stops);
  const optimized = travelingSalesmanApprox(stops, distances);

  return {
    sequence: optimized.sequence,
    totalDistance: optimized.distance,
    estimatedTime: Math.ceil(optimized.distance / 60),
    costEstimate: optimized.distance * 0.5,
  };
}

export async function trackShipment(trackingNumber: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { trackingNumber },
    include: { events: { orderBy: { timestamp: 'desc' } } },
  });

  if (!shipment) throw new Error('Shipment not found');

  const currentEvent = shipment.events[0];
  const eta = estimateDelivery(currentEvent, shipment.destination);

  return {
    status: currentEvent.status,
    currentLocation: currentEvent.location,
    eta: eta,
    history: shipment.events.slice(0, 5),
  };
}

export async function optimizeWarehouseNetwork(orders: Array<{ items: Array<{ productId: string; qty: number }> }>) {
  const fulfillmentCosts: Record<string, number> = {};

  for (const order of orders) {
    let bestWarehouse = '';
    let bestCost = Infinity;

    for (const warehouse of await getActiveWarehouses()) {
      const cost = calculateFulfillmentCost(warehouse, order);
      if (cost < bestCost) {
        bestCost = cost;
        bestWarehouse = warehouse.id;
      }
    }

    fulfillmentCosts[order.id] = bestCost;
  }

  return fulfillmentCosts;
}

function calculateDistances(stops: Array<{ lat: number; lng: number }>) {
  const distances: number[][] = [];
  for (let i = 0; i < stops.length; i++) {
    distances[i] = [];
    for (let j = 0; j < stops.length; j++) {
      distances[i][j] = haversine(stops[i], stops[j]);
    }
  }
  return distances;
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function travelingSalesmanApprox(stops: Array<{ lat: number; lng: number }>, distances: number[][]) {
  const n = stops.length;
  const visited = new Array(n).fill(false);
  let current = 0;
  visited[0] = true;
  const sequence = [0];
  let totalDistance = 0;

  for (let i = 1; i < n; i++) {
    let nearest = -1;
    let minDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && distances[current][j] < minDist) {
        minDist = distances[current][j];
        nearest = j;
      }
    }
    visited[nearest] = true;
    sequence.push(nearest);
    totalDistance += minDist;
    current = nearest;
  }

  return { sequence, distance: totalDistance };
}

function estimateDelivery(event: any, destination: any) {
  const distance = haversine(event.location, destination);
  const hoursNeeded = distance / 80;
  return new Date(Date.now() + hoursNeeded * 60 * 60 * 1000);
}

async function getActiveWarehouses() {
  return prisma.warehouse.findMany({ where: { active: true } });
}

function calculateFulfillmentCost(warehouse: any, order: any) {
  const distance = warehouse.distance || 100;
  return distance * 0.1 + order.items.length * 5;
}
