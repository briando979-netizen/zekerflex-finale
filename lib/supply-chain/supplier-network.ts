import { prisma } from '@/lib/prisma';

export async function rateSupplier(supplierId: string) {
  const orders = await prisma.order.findMany({
    where: { supplierId },
    include: { shipment: true },
  });

  const onTimeCount = orders.filter(o => o.shipment?.actualDelivery <= o.expectedDelivery).length;
  const qualityScore = await calculateQualityScore(supplierId);
  const responsiveness = await calculateResponseTime(supplierId);

  const overallScore = (onTimeCount / orders.length) * 0.4 + qualityScore * 0.4 + responsiveness * 0.2;

  return {
    supplierId,
    onTimePercentage: (onTimeCount / orders.length) * 100,
    qualityScore: qualityScore * 100,
    responsiveness: responsiveness * 100,
    overallScore: overallScore * 100,
    tier: overallScore > 0.8 ? 'A' : overallScore > 0.6 ? 'B' : 'C',
  };
}

export async function assessSupplierRisk(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new Error('Supplier not found');

  const financialHealth = await checkFinancialHealth(supplier);
  const geopoliticalRisk = getGeopoliticalRisk(supplier.country);
  const concentrationRisk = await calculateConcentrationRisk(supplierId);
  const qualityRisk = 1 - (await calculateQualityScore(supplierId));

  const riskScore = (financialHealth + geopoliticalRisk + concentrationRisk + qualityRisk) / 4;

  return {
    supplierId,
    riskScore: riskScore * 100,
    riskLevel: riskScore > 0.6 ? 'HIGH' : riskScore > 0.3 ? 'MEDIUM' : 'LOW',
    factors: {
      financialHealth: financialHealth * 100,
      geopoliticalRisk: geopoliticalRisk * 100,
      concentrationRisk: concentrationRisk * 100,
      qualityRisk: qualityRisk * 100,
    },
    recommendations: generateRecommendations(riskScore),
  };
}

export async function findAlternativeSuppliers(productId: string, currentSupplierId: string) {
  const alternatives = await prisma.supplier.findMany({
    where: {
      products: { some: { id: productId } },
      id: { not: currentSupplierId },
      active: true,
    },
    include: {
      _count: { select: { orders: true } },
    },
  });

  const scored = await Promise.all(
    alternatives.map(async (s) => ({
      ...s,
      score: (await rateSupplier(s.id)).overallScore,
      risk: (await assessSupplierRisk(s.id)).riskScore,
    }))
  );

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

export async function collaborationHub(supplierId: string) {
  return {
    messages: await prisma.message.findMany({ where: { supplierId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    documents: await prisma.document.findMany({ where: { supplierId } }),
    kpis: await getSupplierKPIs(supplierId),
    scorecards: await getSupplierScorecards(supplierId),
  };
}

async function calculateQualityScore(supplierId: string) {
  const defects = await prisma.qualityIssue.count({ where: { supplierId } });
  const orders = await prisma.order.count({ where: { supplierId } });
  return Math.max(0, 1 - defects / (orders || 1) * 0.1);
}

async function calculateResponseTime(supplierId: string) {
  const inquiries = await prisma.supplierInquiry.findMany({ where: { supplierId }, take: 10 });
  const avgResponseTime = inquiries.reduce((sum, i) => sum + (i.responseTime || 0), 0) / inquiries.length;
  return Math.max(0, 1 - avgResponseTime / 48);
}

async function checkFinancialHealth(supplier: any) {
  return Math.random() * 0.5 + 0.5;
}

function getGeopoliticalRisk(country: string) {
  const highRiskCountries = ['X', 'Y', 'Z'];
  return highRiskCountries.includes(country) ? 0.7 : 0.2;
}

async function calculateConcentrationRisk(supplierId: string) {
  const totalOrders = await prisma.order.count();
  const supplierOrders = await prisma.order.count({ where: { supplierId } });
  return Math.min(0.9, supplierOrders / totalOrders);
}

function generateRecommendations(riskScore: number) {
  if (riskScore > 0.6) return ['Diversify suppliers', 'Increase safety stock', 'Implement contingency'];
  if (riskScore > 0.3) return ['Monitor closely', 'Build relationship'];
  return ['Continue current relationship'];
}

async function getSupplierKPIs(supplierId: string) {
  return {
    onTimeDelivery: Math.random() * 0.2 + 0.8,
    quality: Math.random() * 0.15 + 0.85,
    responsiveness: Math.random() * 0.25 + 0.75,
  };
}

async function getSupplierScorecards(supplierId: string) {
  return await prisma.scorecard.findMany({ where: { supplierId } });
}
