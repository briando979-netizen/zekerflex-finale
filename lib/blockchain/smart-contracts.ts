import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const ContractSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  bytecode: z.string(),
  abi: z.array(z.unknown()),
  deploymentTxHash: z.string(),
  deployedAt: z.date(),
  verified: z.boolean().default(false),
});

export async function deploySmartContract(contract: z.infer<typeof ContractSchema>) {
  return prisma.smartContract.create({
    data: {
      address: contract.address,
      bytecode: contract.bytecode,
      abi: JSON.stringify(contract.abi),
      deploymentTxHash: contract.deploymentTxHash,
      deployedAt: contract.deployedAt,
      verified: contract.verified,
    },
  });
}

export async function verifyContractExecution(contractAddress: string, functionName: string, parameters: Record<string, unknown>) {
  const contract = await prisma.smartContract.findUnique({ where: { address: contractAddress } });
  if (!contract?.verified) throw new Error('Contract not verified');
  return { contractAddress, functionName, parameters, executedAt: new Date(), status: 'success' };
}

export async function listSmartContracts(limit = 50, offset = 0) {
  return prisma.smartContract.findMany({ take: limit, skip: offset, orderBy: { deployedAt: 'desc' } });
}
