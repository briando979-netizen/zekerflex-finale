import { prisma } from "@/lib/prisma";

export async function getClientProposals(clientId: string, tenantId: string) {
  return prisma.proposal.findMany({
    where: { clientId, tenantId },
    include: { quote: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function viewProposal(proposalId: string, clientId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { quote: true, comments: true },
  });

  if (!proposal || proposal.clientId !== clientId) {
    throw new Error("Unauthorized");
  }

  // Track view
  await prisma.proposalView.create({
    data: {
      proposalId,
      viewedAt: new Date(),
      viewCount: { increment: 1 },
    },
  });

  return {
    ...proposal,
    content: JSON.parse(proposal.content as string),
  };
}

export async function addClientFeedback(
  proposalId: string,
  clientId: string,
  feedback: string,
  rating?: number
) {
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.clientId !== clientId) {
    throw new Error("Unauthorized");
  }

  return prisma.proposalFeedback.create({
    data: {
      proposalId,
      feedback,
      rating,
      submittedAt: new Date(),
    },
  });
}

export async function requestRevision(
  proposalId: string,
  clientId: string,
  revisionRequests: string[]
) {
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.clientId !== clientId) {
    throw new Error("Unauthorized");
  }

  await prisma.proposalComment.create({
    data: {
      proposalId,
      author: clientId,
      text: `Revision requests: ${revisionRequests.join(", ")}`,
    },
  });

  return prisma.proposal.update({
    where: { id: proposalId },
    data: { status: "DRAFT" },
  });
}

export async function downloadProposal(proposalId: string, clientId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { quote: true },
  });

  if (!proposal || proposal.clientId !== clientId) {
    throw new Error("Unauthorized");
  }

  return {
    filename: `${proposal.title}_${new Date().toISOString().split("T")[0]}.pdf`,
    content: proposal.content,
    quote: proposal.quote,
  };
}

export async function getProposalStatus(proposalId: string, clientId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal || proposal.clientId !== clientId) {
    throw new Error("Unauthorized");
  }

  const views = await prisma.proposalView.findFirst({
    where: { proposalId },
    orderBy: { viewedAt: "desc" },
  });

  return {
    status: proposal.status,
    createdAt: proposal.createdAt,
    sentAt: proposal.sentAt,
    viewedAt: views?.viewedAt,
    signedAt: proposal.signedAt,
    expiresAt: proposal.expiresAt,
    daysRemaining: proposal.expiresAt
      ? Math.ceil((proposal.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null,
  };
}
