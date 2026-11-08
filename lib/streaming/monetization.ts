import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export interface StreamPricing {
  streamId: string;
  type: "free" | "paid" | "subscription";
  price?: number;
  currency?: string;
  subscriptionPrice?: number;
  subscriptionInterval?: "month" | "year";
}

export async function enablePaidStream(streamId: string, price: number, currency = "EUR") {
  return await prisma.liveStream.update({
    where: { id: streamId },
    data: {
      monetizationType: "paid",
      accessPrice: price,
      accessCurrency: currency,
    },
  });
}

export async function enableSubscriptionStream(
  streamId: string,
  monthlyPrice: number,
  yearlyPrice: number
) {
  return await prisma.liveStream.update({
    where: { id: streamId },
    data: {
      monetizationType: "subscription",
      subscriptionMonthlyPrice: monthlyPrice,
      subscriptionYearlyPrice: yearlyPrice,
    },
  });
}

export async function processDonation(streamId: string, userId: string, amount: number, message?: string) {
  const stream = await prisma.liveStream.findUnique({ where: { id: streamId } });
  if (!stream) throw new Error("Stream not found");

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: "eur",
    metadata: { streamId, userId, type: "donation" },
  });

  return await prisma.streamDonation.create({
    data: {
      streamId,
      userId,
      amount,
      message,
      stripePaymentId: paymentIntent.id,
      status: "pending",
    },
  });
}

export async function processSuperChat(streamId: string, userId: string, amount: number, message: string) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: "eur",
    metadata: { streamId, userId, type: "superchat" },
  });

  return await prisma.streamSuperChat.create({
    data: {
      streamId,
      userId,
      amount,
      message,
      stripePaymentId: paymentIntent.id,
      status: "pending",
      pinnedAt: new Date(),
    },
  });
}

export async function recordAccessFee(streamId: string, userId: string, amount: number) {
  return await prisma.streamAccessTransaction.create({
    data: {
      streamId,
      userId,
      amount,
      type: "access_fee",
      status: "completed",
    },
  });
}

export async function getStreamerEarnings(userId: string, startDate: Date, endDate: Date) {
  const donations = await prisma.streamDonation.aggregate({
    where: {
      stream: { userId },
      createdAt: { gte: startDate, lte: endDate },
      status: "completed",
    },
    _sum: { amount: true },
  });

  const superChats = await prisma.streamSuperChat.aggregate({
    where: {
      stream: { userId },
      createdAt: { gte: startDate, lte: endDate },
      status: "completed",
    },
    _sum: { amount: true },
  });

  const accessFees = await prisma.streamAccessTransaction.aggregate({
    where: {
      stream: { userId },
      createdAt: { gte: startDate, lte: endDate },
      status: "completed",
    },
    _sum: { amount: true },
  });

  const totalEarnings =
    (donations._sum.amount || 0) + (superChats._sum.amount || 0) + (accessFees._sum.amount || 0);

  const platformFee = totalEarnings * 0.3;
  const streamerPayout = totalEarnings - platformFee;

  return {
    donations: donations._sum.amount || 0,
    superChats: superChats._sum.amount || 0,
    accessFees: accessFees._sum.amount || 0,
    totalEarnings,
    platformFee,
    streamerPayout,
  };
}

export async function processPayout(userId: string, amount: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.stripeConnectId) throw new Error("User not found or not connected to Stripe");

  const transfer = await stripe.transfers.create({
    amount: Math.round(amount * 100),
    currency: "eur",
    destination: user.stripeConnectId,
    metadata: { userId },
  });

  return await prisma.streamerPayout.create({
    data: {
      userId,
      amount,
      stripeTransferId: transfer.id,
      status: "completed",
      paidAt: new Date(),
    },
  });
}

export async function setSuperChatPrice(amount: number) {
  return { amount, currency: "EUR" };
}
