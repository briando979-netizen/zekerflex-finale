import { prisma } from '@/lib/prisma';

export async function tokenizeAsset(symbol: string, name: string, totalSupply: bigint, decimals: number, owner: string, contractAddress: string) {
  return prisma.token.create({
    data: { symbol, name, totalSupply: totalSupply.toString(), decimals, owner, contractAddress },
  });
}

export async function transferTokens(from: string, to: string, amount: bigint, tokenId: string) {
  return prisma.tokenTransfer.create({
    data: { fromAddress: from, toAddress: to, amount: amount.toString(), tokenId, timestamp: new Date(), status: 'confirmed' },
  });
}

export async function tradeTokenPair(tokenAId: string, tokenBId: string, amountA: bigint, amountB: bigint, trader: string) {
  return prisma.tokenTrade.create({
    data: {
      tokenAId, tokenBId, amountA: amountA.toString(), amountB: amountB.toString(), trader,
      executedAt: new Date(), price: (Number(amountB) / Number(amountA)).toFixed(8),
    },
  });
}

export async function getTokenBalance(address: string, tokenId: string) {
  const balance = await prisma.tokenBalance.findUnique({ where: { address_tokenId: { address, tokenId } } });
  return balance?.balance || '0';
}
