import { prisma } from "@/lib/prisma";

export async function getVendorAnalytics(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new Error("Vendor not found");

  const contracts = await prisma.vendorContract.findMany({
    where: { vendorId, status: "ACTIVE" },
  });

  const totalContractValue = contracts.reduce((sum, c) => sum + (c.amount || 0), 0);

  return {
    vendorId,
    totalSpend: vendor.totalSpend,
    activeContractValue: totalContractValue,
    performanceScore: vendor.performanceScore,
    rating: vendor.rating,
    complianceStatus: calculateComplianceStatus(contracts),
    riskLevel: calculateRiskLevel(vendor),
  };
}

export async function getSpendAnalytics() {
  const vendors = await prisma.vendor.findMany();
  const totalSpend = vendors.reduce((sum, v) => sum + v.totalSpend, 0);

  return {
    totalSpend,
    vendorCount: vendors.length,
    topVendors: vendors
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10)
      .map(v => ({ id: v.id, name: v.name, spend: v.totalSpend, score: v.performanceScore })),
    averagePerformance: vendors.reduce((sum, v) => sum + v.performanceScore, 0) / vendors.length,
  };
}

export async function getComplianceReport() {
  const contracts = await prisma.vendorContract.findMany({
    where: { status: "ACTIVE" },
  });

  const compliant = contracts.filter(c => {
    const complianceItems = Array.isArray(c.complianceItems) ? c.complianceItems : [];
    return complianceItems.length > 0;
  });

  return {
    totalContracts: contracts.length,
    compliantContracts: compliant.length,
    complianceRate: (compliant.length / contracts.length) * 100,
  };
}

export async function getRiskReport() {
  const vendors = await prisma.vendor.findMany();

  const highRisk = vendors.filter(v => v.performanceScore < 60);
  const mediumRisk = vendors.filter(v => v.performanceScore >= 60 && v.performanceScore < 80);
  const lowRisk = vendors.filter(v => v.performanceScore >= 80);

  return {
    highRisk: highRisk.map(v => ({ id: v.id, name: v.name, score: v.performanceScore })),
    mediumRisk: mediumRisk.map(v => ({ id: v.id, name: v.name, score: v.performanceScore })),
    lowRisk: lowRisk.map(v => ({ id: v.id, name: v.name, score: v.performanceScore })),
  };
}

function calculateComplianceStatus(contracts: any[]): string {
  if (!contracts.length) return "NO_CONTRACTS";
  const compliant = contracts.filter(c => Array.isArray(c.complianceItems) && c.complianceItems.length > 0);
  return compliant.length === contracts.length ? "COMPLIANT" : "PARTIAL";
}

function calculateRiskLevel(vendor: any): "LOW" | "MEDIUM" | "HIGH" {
  if (vendor.performanceScore >= 80) return "LOW";
  if (vendor.performanceScore >= 60) return "MEDIUM";
  return "HIGH";
}
