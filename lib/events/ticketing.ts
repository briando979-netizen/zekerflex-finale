import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ticketTypeSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  price: z.number().min(0),
  quantity: z.number().positive(),
  earlyBirdPrice: z.number().optional(),
  earlyBirdUntil: z.string().datetime().optional(),
  groupDiscountThreshold: z.number().optional(),
  groupDiscountPercentage: z.number().min(0).max(100).optional(),
});

export async function createTicketType(eventId: string, data: z.infer<typeof ticketTypeSchema>) {
  const parsed = ticketTypeSchema.parse(data);
  return prisma.ticketType.create({
    data: {
      eventId,
      ...parsed,
      priceCent: Math.round(parsed.price * 100),
      earlyBirdPriceCent: parsed.earlyBirdPrice ? Math.round(parsed.earlyBirdPrice * 100) : null,
      soldCount: 0,
    },
  });
}

export async function getAvailableTickets(eventId: string) {
  return prisma.ticketType.findMany({
    where: {
      eventId,
      soldCount: { lt: prisma.ticketType.fields.quantity },
    },
  });
}

export async function purchaseTicket(ticketTypeId: string, quantity: number, registrationId: string, groupSize?: number) {
  const ticketType = await prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
  if (!ticketType) throw new Error("Ticket type not found");

  if (ticketType.soldCount + quantity > ticketType.quantity) {
    throw new Error("Insufficient tickets available");
  }

  let price = ticketType.priceCent * quantity;

  // Early bird pricing
  if (ticketType.earlyBirdUntil && new Date() < new Date(ticketType.earlyBirdUntil) && ticketType.earlyBirdPriceCent) {
    price = ticketType.earlyBirdPriceCent * quantity;
  }

  // Group discount
  if (groupSize && ticketType.groupDiscountThreshold && groupSize >= ticketType.groupDiscountThreshold && ticketType.groupDiscountPercentage) {
    price = Math.round(price * (1 - ticketType.groupDiscountPercentage / 100));
  }

  await prisma.ticketType.update({
    where: { id: ticketTypeId },
    data: { soldCount: { increment: quantity } },
  });

  return prisma.ticket.createMany({
    data: Array(quantity)
      .fill(null)
      .map(() => ({
        ticketTypeId,
        registrationId,
        priceCent: price / quantity,
        status: "PENDING",
      })),
  });
}

export async function enableDynamicPricing(ticketTypeId: string, maxPrice: number) {
  return prisma.ticketType.update({
    where: { id: ticketTypeId },
    data: { dynamicPricingEnabled: true, maxPriceCent: Math.round(maxPrice * 100) },
  });
}
