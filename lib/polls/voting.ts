import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const pollSchema = z.object({
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1)).min(2).max(10),
  channelId: z.string(),
  anonymous: z.boolean().default(false),
  multipleChoice: z.boolean().default(false),
  expiresAt: z.date().optional(),
});

export type PollInput = z.infer<typeof pollSchema>;

export async function createPoll(userId: string, data: PollInput) {
  const validated = pollSchema.parse(data);
  const poll = await prisma.poll.create({
    data: {
      question: validated.question,
      options: validated.options,
      channelId: validated.channelId,
      creatorId: userId,
      anonymous: validated.anonymous,
      multipleChoice: validated.multipleChoice,
      expiresAt: validated.expiresAt,
      votes: validated.options.reduce((acc, opt) => ({ ...acc, [opt]: [] }), {}),
    },
  });
  return poll;
}

export async function getPoll(pollId: string) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { creator: { select: { id: true, email: true } } },
  });
  if (!poll) throw AppError.notFound("Poll not found");
  return poll;
}

export async function vote(pollId: string, userId: string, optionIndex: number) {
  const poll = await getPoll(pollId);

  if (poll.expiresAt && poll.expiresAt < new Date()) {
    throw AppError.validation("Poll has expired");
  }

  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    throw AppError.validation("Invalid option");
  }

  const votes = poll.votes || {};
  const option = poll.options[optionIndex];

  if (!votes[option]) votes[option] = [];

  const hasVoted = votes[option].includes(poll.anonymous ? `anon_${userId}` : userId);
  if (hasVoted && !poll.multipleChoice) {
    throw AppError.validation("Already voted for this option");
  }

  const voterId = poll.anonymous ? `anon_${Date.now()}_${Math.random()}` : userId;
  if (!votes[option].includes(voterId)) {
    votes[option].push(voterId);
  }

  return prisma.poll.update({
    where: { id: pollId },
    data: { votes, totalVotes: { increment: 1 } },
  });
}

export async function revokVote(pollId: string, userId: string, optionIndex: number) {
  const poll = await getPoll(pollId);
  const votes = poll.votes || {};
  const option = poll.options[optionIndex];

  if (votes[option]) {
    votes[option] = votes[option].filter((v: string) => v !== userId);
  }

  return prisma.poll.update({
    where: { id: pollId },
    data: { votes, totalVotes: Math.max(0, poll.totalVotes - 1) },
  });
}

export async function listChannelPolls(channelId: string) {
  return prisma.poll.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
  });
}

export async function closePoll(pollId: string) {
  return prisma.poll.update({
    where: { id: pollId },
    data: { closedAt: new Date() },
  });
}

export async function getPollResults(pollId: string) {
  const poll = await getPoll(pollId);
  const results = poll.options.map((opt: string, idx: number) => ({
    option: opt,
    votes: (poll.votes?.[opt]?.length || 0),
    percentage: poll.totalVotes > 0 ? ((poll.votes?.[opt]?.length || 0) / poll.totalVotes) * 100 : 0,
  }));
  return { poll, results, totalVotes: poll.totalVotes };
}

export async function schedulePoll(userId: string, data: PollInput & { scheduledFor: Date }) {
  return prisma.scheduledPoll.create({
    data: {
      question: data.question,
      options: data.options,
      channelId: data.channelId,
      creatorId: userId,
      anonymous: data.anonymous,
      multipleChoice: data.multipleChoice,
      scheduledFor: data.scheduledFor,
    },
  });
}
