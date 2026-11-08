import { prisma } from "@/lib/prisma";

export async function syncProposalToCRM(proposalId: string, crmId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { quote: true },
  });

  if (!proposal) throw new Error("Proposal not found");

  return prisma.proposalIntegration.upsert({
    where: { proposalId },
    create: {
      proposalId,
      crmId,
      crmType: "salesforce",
      syncedAt: new Date(),
      metadata: JSON.stringify({
        opportunity: crmId,
        amount: proposal.quote?.total,
        status: proposal.status,
      }),
    },
    update: {
      syncedAt: new Date(),
      metadata: JSON.stringify({
        opportunity: crmId,
        amount: proposal.quote?.total,
        status: proposal.status,
      }),
    },
  });
}

export async function createPaymentIntent(proposalId: string, amount: number) {
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Proposal not found");

  return prisma.proposalPayment.create({
    data: {
      proposalId,
      amount,
      status: "PENDING",
      paymentMethod: "stripe",
    },
  });
}

export async function recordPayment(proposalPaymentId: string, transactionId: string) {
  return prisma.proposalPayment.update({
    where: { id: proposalPaymentId },
    data: {
      status: "COMPLETED",
      transactionId,
      paidAt: new Date(),
    },
  });
}

export async function archiveProposal(proposalId: string) {
  return prisma.proposal.update({
    where: { id: proposalId },
    data: { archived: true },
  });
}

export async function exportProposal(proposalId: string, format: "pdf" | "docx" | "html") {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { quote: true },
  });

  if (!proposal) throw new Error("Proposal not found");

  const content = {
    title: proposal.title,
    createdAt: proposal.createdAt,
    quote: proposal.quote,
    content: JSON.parse(proposal.content as string),
    format,
  };

  // Store export record
  await prisma.proposalExport.create({
    data: {
      proposalId,
      format,
      exportedAt: new Date(),
    },
  });

  return content;
}

export async function getIntegrationStatus(proposalId: string) {
  return prisma.proposalIntegration.findUnique({
    where: { proposalId },
  });
}
