import { prisma } from "@/lib/prisma";

export async function submitForReview(proposalId: string) {
  return prisma.proposal.update({
    where: { id: proposalId },
    data: { status: "REVIEW" },
  });
}

export async function approveProposal(proposalId: string, approvedBy: string) {
  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
    },
  });
}

export async function rejectProposal(proposalId: string, rejectedBy: string, reason: string) {
  await prisma.proposalComment.create({
    data: {
      proposalId,
      author: rejectedBy,
      text: `Rejected: ${reason}`,
    },
  });

  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: "DRAFT",
      approvedBy: null,
    },
  });
}

export async function sendToClient(proposalId: string, clientEmail: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.status !== "APPROVED") {
    throw new Error("Proposal must be approved before sending");
  }

  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      sentTo: clientEmail,
    },
  });
}

export async function signProposal(proposalId: string, signature: string, signedBy: string) {
  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: "SIGNED",
      signature,
      signedBy,
      signedAt: new Date(),
    },
  });
}

export async function declineProposal(proposalId: string, reason: string) {
  await prisma.proposalComment.create({
    data: {
      proposalId,
      author: "system",
      text: `Declined by client: ${reason}`,
    },
  });

  return prisma.proposal.update({
    where: { id: proposalId },
    data: { status: "DECLINED" },
  });
}

export async function getProposalHistory(proposalId: string) {
  return prisma.proposalComment.findMany({
    where: { proposalId },
    orderBy: { createdAt: "asc" },
  });
}

export async function addComment(proposalId: string, author: string, text: string) {
  return prisma.proposalComment.create({
    data: { proposalId, author, text },
  });
}
