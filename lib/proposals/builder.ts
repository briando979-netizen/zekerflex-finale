import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ProposalTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  content: z.any(),
  sections: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["text", "table", "image", "signature"]),
    content: z.any(),
  })),
  branding: z.object({
    logo: z.string().optional(),
    colors: z.object({ primary: z.string(), secondary: z.string() }).optional(),
    font: z.string().optional(),
  }).optional(),
});

export async function createProposalTemplate(data: z.infer<typeof ProposalTemplateSchema>) {
  const validated = ProposalTemplateSchema.parse(data);
  return prisma.proposalTemplate.create({
    data: {
      ...validated,
      sections: JSON.stringify(validated.sections),
      branding: validated.branding ? JSON.stringify(validated.branding) : null,
    },
  });
}

export async function getProposalTemplates(tenantId: string) {
  return prisma.proposalTemplate.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createProposal(data: {
  templateId: string;
  clientId: string;
  title: string;
  content: any;
  expiresAt?: Date;
}) {
  return prisma.proposal.create({
    data: {
      ...data,
      status: "DRAFT",
      version: 1,
      content: JSON.stringify(data.content),
    },
  });
}

export async function updateProposal(id: string, data: Partial<{
  title: string;
  content: any;
  status: "DRAFT" | "REVIEW" | "APPROVED" | "SIGNED" | "DECLINED";
}>) {
  return prisma.proposal.update({
    where: { id },
    data: {
      ...data,
      content: data.content ? JSON.stringify(data.content) : undefined,
      version: { increment: 1 },
    },
  });
}

export async function getProposal(id: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal) return null;
  return {
    ...proposal,
    content: JSON.parse(proposal.content as string),
  };
}

export async function listProposals(tenantId: string, filters?: {
  status?: string;
  clientId?: string;
}) {
  return prisma.proposal.findMany({
    where: { tenantId, ...filters },
    orderBy: { createdAt: "desc" },
  });
}
