// Web3, blockchain, NFTs, and crypto payments

export interface CryptoPayment {
  id: string;
  orderId: string;
  currency: "BTC" | "ETH" | "USDC" | "USDT";
  amountCrypto: string; // wei format
  amountFiat: number; // cents
  walletAddress: string;
  transactionHash?: string;
  status: "pending" | "confirmed" | "failed";
  confirmations: number;
}

export interface NFTProduct {
  productId: string;
  contractAddress: string;
  tokenId: string;
  chain: "ethereum" | "polygon" | "solana" | "arbitrum";
  royaltyPercentage: number;
  metadata: {
    name: string;
    description: string;
    image: string;
    attributes: Record<string, string>;
  };
}

export interface DigitalAsset {
  id: string;
  productId: string;
  type: "nft" | "token" | "membership" | "license";
  deliveryMethod: "email" | "wallet" | "download";
  metadata: Record<string, any>;
}

export interface BlockchainWallet {
  customerId: string;
  address: string;
  chain: string;
  verified: boolean;
  nftsHeld: string[]; // NFT token IDs
  balance: number; // wei
}

export async function initiateCryptoPayment(
  orderId: string,
  currency: string,
  amountFiat: number
): Promise<CryptoPayment> {
  return {
    id: `crypto_${Date.now()}`,
    orderId,
    currency: currency as any,
    amountCrypto: "0",
    amountFiat,
    walletAddress: "",
    status: "pending",
    confirmations: 0,
  };
}

export async function monitorCryptoTransaction(paymentId: string): Promise<CryptoPayment> {
  // TODO: Watch blockchain for transaction confirmation
  return { id: paymentId, orderId: "", currency: "BTC", amountCrypto: "0", amountFiat: 0, walletAddress: "", status: "pending", confirmations: 0 };
}

export async function mintNFT(
  productId: string,
  customerId: string,
  metadata: Record<string, any>
): Promise<NFTProduct> {
  // TODO: Mint NFT on blockchain (use NFT.storage, Pinata, etc.)
  return {
    productId,
    contractAddress: "",
    tokenId: "",
    chain: "ethereum",
    royaltyPercentage: 5,
    metadata: { name: "", description: "", image: "", attributes: {} },
  };
}

export async function createMembershipNFT(
  customerId: string,
  tier: string
): Promise<DigitalAsset> {
  return {
    id: `nft_${Date.now()}`,
    productId: "",
    type: "membership",
    deliveryMethod: "wallet",
    metadata: { tier },
  };
}

export async function integrateWallet(
  customerId: string,
  address: string
): Promise<BlockchainWallet> {
  return {
    customerId,
    address,
    chain: "ethereum",
    verified: false,
    nftsHeld: [],
    balance: 0,
  };
}

export const SUPPORTED_CHAINS = [
  { id: "ethereum", name: "Ethereum", symbol: "ETH" },
  { id: "polygon", name: "Polygon", symbol: "MATIC" },
  { id: "solana", name: "Solana", symbol: "SOL" },
  { id: "arbitrum", name: "Arbitrum", symbol: "ARB" },
];
