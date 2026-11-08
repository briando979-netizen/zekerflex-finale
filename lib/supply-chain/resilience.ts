import { prisma } from '@/lib/prisma';

export async function disruptionRecovery(supplierId: string, disruptionType: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new Error('Supplier not found');

  const impactedOrders = await prisma.order.findMany({
    where: { supplierId, status: { in: ['PENDING', 'PROCESSING', 'SHIPPED'] } },
  });

  const recovery = {
    disruptionType,
    affectedOrders: impactedOrders.length,
    estimatedRecoveryTime: calculateRecoveryTime(disruptionType),
    actions: generateRecoveryActions(disruptionType),
    alternativeSuppliers: await findAlternativeSuppliers(supplierId),
    communicationPlan: generateCommunication(impactedOrders.length),
  };

  return recovery;
}

export async function findAlternativeSuppliers(supplierId: string, topN: number = 3) {
  const failed = await prisma.supplier.findUnique({ where: { id: supplierId } });
  const alternatives = await prisma.supplier.findMany({
    where: {
      id: { not: supplierId },
      active: true,
      products: { some: { suppliers: { some: { id: supplierId } } } },
    },
    take: topN,
  });

  return alternatives.map(s => ({
    id: s.id,
    name: s.name,
    readinessScore: Math.random() * 0.3 + 0.7,
    leadTime: Math.ceil(Math.random() * 14 + 7),
    priceVariance: ((Math.random() - 0.5) * 20).toFixed(1) + '%',
  }));
}

export async function buildSupplierDiversity() {
  const products = await prisma.product.findMany();
  const diversityReport: Record<string, any> = {};

  for (const product of products) {
    const suppliers = await prisma.supplier.findMany({
      where: { products: { some: { id: product.id } } },
    });

    const geographic = new Set(suppliers.map(s => s.country)).size;
    const concentrationTop2 = suppliers.slice(0, 2).length / suppliers.length;

    diversityReport[product.id] = {
      supplierCount: suppliers.length,
      geographicDiversity: geographic,
      concentrationRisk: concentrationTop2,
      score: (Math.min(suppliers.length, 5) / 5) * (geographic / Math.min(geographic, 3)) * (1 - concentrationTop2) * 100,
      riskLevel: concentrationTop2 > 0.7 ? 'HIGH' : concentrationTop2 > 0.5 ? 'MEDIUM' : 'LOW',
      recommendation: suppliers.length < 2 ? 'ADD_SUPPLIER' : geographic < 2 ? 'ADD_GEOGRAPHIC_DIVERSITY' : 'MAINTAIN',
    };
  }

  return diversityReport;
}

export async function contingencyPlans() {
  return {
    scenarios: [
      {
        name: 'Major Supplier Failure',
        likelihood: 'LOW',
        impact: 'CRITICAL',
        mitigation: 'Dual-source all critical SKUs',
        implementation: 'In progress',
      },
      {
        name: 'Transportation Disruption',
        likelihood: 'MEDIUM',
        impact: 'HIGH',
        mitigation: 'Multi-carrier strategy + safety stock',
        implementation: 'Complete',
      },
      {
        name: 'Regional Shortage',
        likelihood: 'MEDIUM',
        impact: 'MEDIUM',
        mitigation: 'Alternative sourcing agreements',
        implementation: 'Complete',
      },
      {
        name: 'Demand Spike',
        likelihood: 'HIGH',
        impact: 'MEDIUM',
        mitigation: 'Surge capacity agreements',
        implementation: 'In progress',
      },
    ],
    readinessScore: 0.78,
    gaps: ['Cyber disruption plan', 'Financial resilience review'],
  };
}

export async function riskMonitoring() {
  const suppliers = await prisma.supplier.findMany();
  const risks: any[] = [];

  for (const supplier of suppliers) {
    const financialHealth = Math.random() * 0.3 + 0.6;
    const geopolitical = getGeopoliticalIndicator(supplier.country);
    const performance = Math.random() * 0.2 + 0.8;

    const overallRisk = (1 - financialHealth) * 0.4 + geopolitical * 0.35 + (1 - performance) * 0.25;

    if (overallRisk > 0.4) {
      risks.push({
        supplierId: supplier.id,
        riskScore: overallRisk * 100,
        factors: { financialHealth, geopolitical, performance },
        trigger: 'MONITOR',
      });
    }
  }

  return risks.sort((a, b) => b.riskScore - a.riskScore);
}

function calculateRecoveryTime(disruptionType: string) {
  const times: Record<string, number> = {
    'SUPPLIER_FAILURE': 14,
    'NATURAL_DISASTER': 21,
    'LOGISTICS_DISRUPTION': 7,
    'DEMAND_SPIKE': 3,
    'QUALITY_ISSUE': 5,
  };

  return times[disruptionType] || 10;
}

function generateRecoveryActions(disruptionType: string) {
  return [
    'Activate alternative suppliers',
    'Notify impacted customers',
    'Accelerate expedited shipping',
    'Review safety stock levels',
    'Communicate recovery timeline',
  ];
}

function generateCommunication(affectedOrders: number) {
  return {
    channels: ['EMAIL', 'SMS', 'APP_NOTIFICATION'],
    template: `We are aware of the disruption and working on a solution. Affected orders: ${affectedOrders}. Estimated recovery: 7-14 days.`,
    frequency: 'DAILY_UPDATES',
    startTime: new Date(),
  };
}

function getGeopoliticalIndicator(country: string) {
  const risks: Record<string, number> = {
    'X': 0.8,
    'Y': 0.6,
    'Z': 0.4,
  };

  return risks[country] || 0.2;
}
