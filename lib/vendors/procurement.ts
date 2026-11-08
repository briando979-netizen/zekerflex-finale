import { prisma } from "@/lib/prisma";
import { RFQSchema, ContractSchema } from "./types";

export async function createRFQ(data: any) {
  const validated = RFQSchema.partial().parse(data);
  return prisma.rFQ.create({
    data: {
      ...validated,
      createdAt: new Date(),
    },
  });
}

export async function getRFQ(id: string) {
  return prisma.rFQ.findUnique({ where: { id } });
}

export async function updateRFQStatus(id: string, status: string) {
  return prisma.rFQ.update({
    where: { id },
    data: { status, updatedAt: new Date() },
  });
}

export async function submitQuote(rfqId: string, vendorId: string, amount: number, deliveryDate: Date, terms: string) {
  const rfq = await getRFQ(rfqId);
  if (!rfq) throw new Error("RFQ not found");

  const quotes = Array.isArray(rfq.quotes) ? rfq.quotes : [];
  quotes.push({ vendorId, amount, deliveryDate, terms });

  return prisma.rFQ.update({
    where: { id: rfqId },
    data: { quotes, updatedAt: new Date() },
  });
}

export async function evaluateQuotes(rfqId: string) {
  const rfq = await getRFQ(rfqId);
  if (!rfq || !Array.isArray(rfq.quotes)) throw new Error("No quotes found");

  const bestQuote = (rfq.quotes as any[]).reduce((prev, current) =>
    current.amount < prev.amount ? current : prev
  );

  return {
    rfqId,
    selectedVendor: bestQuote.vendorId,
    amount: bestQuote.amount,
    deliveryDate: bestQuote.deliveryDate,
  };
}

export async function createContract(vendorId: string, contractData: any) {
  const validated = ContractSchema.partial().parse(contractData);
  return prisma.vendorContract.create({
    data: {
      ...validated,
      vendorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function getContract(id: string) {
  return prisma.vendorContract.findUnique({ where: { id } });
}

export async function updateContractStatus(id: string, status: string) {
  return prisma.vendorContract.update({
    where: { id },
    data: { status, updatedAt: new Date() },
  });
}
