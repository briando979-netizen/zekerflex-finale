import { prisma } from "@/lib/prisma";
import type { PolicyState } from "./types";

export async function createPolicy(
  tenantId: string,
  policyName: string,
  policyBody: string,
  description: string | null,
  owner: string | null
): Promise<string> {
  const policy = await prisma.governancePolicy.create({
    data: {
      tenantId,
      policyName,
      policyBody,
      description,
      owner,
      status: "DRAFT"
    }
  });
  return policy.id;
}

export async function approvePolicy(
  policyId: string,
  approverRole: string,
  comment: string | null
): Promise<void> {
  const policy = await prisma.governancePolicy.findUnique({
    where: { id: policyId },
    include: { approvals: { orderBy: { stepNumber: "asc" } } }
  });

  if (!policy) throw new Error("Policy not found");

  let stepNumber = 1;
  const hasExistingApproval = policy.approvals.some(a => a.approverRole === approverRole);
  
  if (!hasExistingApproval) {
    stepNumber = Math.max(...policy.approvals.map(a => a.stepNumber), 0) + 1;
  }

  const approval = policy.approvals.find(a => a.approverRole === approverRole);
  
  if (approval) {
    await prisma.governanceApprovalFlow.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        comment
      }
    });
  } else {
    await prisma.governanceApprovalFlow.create({
      data: {
        policyId,
        stepNumber,
        approverRole,
        status: "APPROVED",
        approvedAt: new Date(),
        comment
      }
    });
  }

  const allApprovals = await prisma.governanceApprovalFlow.findMany({
    where: { policyId }
  });

  if (allApprovals.every(a => a.status === "APPROVED")) {
    await prisma.governancePolicy.update({
      where: { id: policyId },
      data: {
        status: "APPROVED",
        effectiveDate: new Date()
      }
    });
  }
}

export async function reviewPolicy(
  policyId: string,
  reviewDate: Date
): Promise<void> {
  await prisma.governancePolicy.update({
    where: { id: policyId },
    data: { reviewDate }
  });
}

export async function listPolicies(tenantId: string): Promise<PolicyState[]> {
  const policies = await prisma.governancePolicy.findMany({
    where: { tenantId },
    include: { approvals: true }
  });

  return policies.map(p => {
    const approvals = p.approvals ?? [];
    const approved = approvals.filter(a => a.status === "APPROVED").length;
    const total = Math.max(approvals.length, 1);

    return {
      policyId: p.id,
      policyName: p.policyName,
      status: p.status,
      effectiveDate: p.effectiveDate,
      reviewDate: p.reviewDate,
      approvalProgress: total > 0 ? Math.round((approved / total) * 100) : 0,
      approvalsRemaining: total - approved
    };
  });
}
