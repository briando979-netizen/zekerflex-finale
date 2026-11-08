import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const contractSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  value: z.number().optional(),
  parties: z.array(z.string()),
  status: z.enum(["draft", "active", "expired", "terminated"]),
});

type Contract = z.infer<typeof contractSchema>;

export async function createContract(tenantId: string, contract: Contract) {
  const validated = contractSchema.parse(contract);

  return prisma.contract.create({
    data: {
      ...validated,
      tenantId,
      obligations: {
        create: [
          { description: "Review quarterly", dueDate: new Date() },
        ],
      },
    },
    include: { obligations: true },
  });
}

export async function listContracts(tenantId: string) {
  return prisma.contract.findMany({
    where: { tenantId },
    include: { obligations: true },
    orderBy: { startDate: "desc" },
  });
}

export async function getContract(tenantId: string, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      obligations: true,
      signatories: true,
      auditLog: { orderBy: { timestamp: "desc" } },
    },
  });

  if (!contract || contract.tenantId !== tenantId) {
    throw AppError.notFound("Contract not found");
  }

  return contract;
}

export async function updateContractStatus(
  tenantId: string,
  contractId: string,
  status: string
) {
  await getContract(tenantId, contractId);

  return prisma.contract.update({
    where: { id: contractId },
    data: {
      status,
      auditLog: {
        create: {
          action: `Status changed to ${status}`,
          userId: "system",
        },
      },
    },
  });
}

export async function addObligation(
  tenantId: string,
  contractId: string,
  description: string,
  dueDate: Date
) {
  await getContract(tenantId, contractId);

  return prisma.contractObligation.create({
    data: {
      contractId,
      description,
      dueDate,
      status: "pending",
    },
  });
}

export async function addSignatory(
  tenantId: string,
  contractId: string,
  email: string,
  name: string
) {
  await getContract(tenantId, contractId);

  return prisma.contractSignatory.create({
    data: {
      contractId,
      email,
      name,
      status: "pending",
    },
  });
}

export async function signContract(
  contractId: string,
  signatoryId: string,
  signature: string
) {
  return prisma.contractSignatory.update({
    where: { id: signatoryId },
    data: {
      status: "signed",
      signature,
      signedAt: new Date(),
    },
  });
}

export async function checkRenewalDates(tenantId: string) {
  const soon = new Date();
  soon.setDate(soon.getDate() + 90);

  return prisma.contract.findMany({
    where: {
      tenantId,
      endDate: {
        gte: new Date(),
        lte: soon,
      },
    },
    select: { id: true, name: true, endDate: true },
  });
}

export async function assessRisk(contractId: string): Promise<number> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { obligations: true },
  });

  if (!contract) return 0;

  let risk = 0;
  const now = new Date();

  // Risk for unfulfilled obligations
  const overdue =
    contract.obligations?.filter((o) => o.dueDate < now && !o.completedAt)
      .length ?? 0;
  risk += overdue * 25;

  // Risk for expiring contract
  if (contract.endDate) {
    const daysUntilExpire = Math.floor(
      (contract.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpire < 30) risk += 30;
  }

  return Math.min(risk, 100);
}
