import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const channelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().default(false),
  members: z.array(z.string()).optional(),
});

export type ChannelInput = z.infer<typeof channelSchema>;

export async function createChannel(tenantId: string, data: ChannelInput) {
  const validated = channelSchema.parse(data);
  const channel = await prisma.teamChannel.create({
    data: {
      tenantId,
      name: validated.name,
      description: validated.description,
      isPrivate: validated.isPrivate,
      members: validated.members || [],
    },
  });
  return channel;
}

export async function getChannel(channelId: string, tenantId: string) {
  const channel = await prisma.teamChannel.findFirst({
    where: { id: channelId, tenantId },
    include: { messages: { take: 50, orderBy: { createdAt: "desc" } } },
  });
  if (!channel) throw AppError.notFound("Channel not found");
  return channel;
}

export async function listChannels(tenantId: string, userId: string) {
  return prisma.teamChannel.findMany({
    where: {
      OR: [{ tenantId, isPrivate: false }, { tenantId, members: { has: userId } }],
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function addMember(channelId: string, userId: string) {
  return prisma.teamChannel.update({
    where: { id: channelId },
    data: { members: { push: userId } },
  });
}

export async function removeMember(channelId: string, userId: string) {
  const channel = await prisma.teamChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw AppError.notFound("Channel not found");
  const updated = channel.members.filter((m: string) => m !== userId);
  return prisma.teamChannel.update({
    where: { id: channelId },
    data: { members: updated },
  });
}

export async function searchChannels(tenantId: string, query: string) {
  return prisma.teamChannel.findMany({
    where: { tenantId, name: { contains: query, mode: "insensitive" } },
    take: 10,
  });
}
