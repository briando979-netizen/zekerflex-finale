import { prisma } from '@/lib/prisma';

export async function initiateBFTValidation(txHash: string, validators: string[], faultTolerance = 0.33) {
  const required = Math.ceil(validators.length * (1 - faultTolerance));
  return prisma.consensusRound.create({
    data: { transactionHash: txHash, validators, requiredApprovals: required, approvals: 0, status: 'pending' },
  });
}

export async function submitValidatorApproval(roundId: string, validator: string, approved: boolean) {
  const round = await prisma.consensusRound.findUnique({ where: { id: roundId } });
  const newApprovals = approved ? (round?.approvals || 0) + 1 : (round?.approvals || 0);
  return prisma.consensusRound.update({
    where: { id: roundId },
    data: { approvals: newApprovals, status: newApprovals >= (round?.requiredApprovals || 0) ? 'finalized' : 'pending' },
  });
}

export async function checkConsensusStatus(roundId: string) {
  const r = await prisma.consensusRound.findUnique({ where: { id: roundId } });
  return { status: r?.status, approvals: r?.approvals, required: r?.requiredApprovals };
}
