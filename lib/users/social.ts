import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';

export async function followUser(followerId: string, followeeId: string) {
  if (followerId === followeeId) throw AppError.validation('Cannot follow yourself');

  return prisma.userFollow.create({
    data: { followerId, followeeId },
  });
}

export async function unfollowUser(followerId: string, followeeId: string) {
  return prisma.userFollow.deleteMany({
    where: { followerId, followeeId },
  });
}

export async function getFollowers(userId: string, limit = 50) {
  return prisma.userFollow.findMany({
    where: { followeeId: userId },
    include: { follower: { select: { id: true, displayName: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getFollowing(userId: string, limit = 50) {
  return prisma.userFollow.findMany({
    where: { followerId: userId },
    include: { followee: { select: { id: true, displayName: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw AppError.validation('Cannot block yourself');

  return prisma.userBlock.create({
    data: { blockerId, blockedId },
  });
}

export async function unblockUser(blockerId: string, blockedId: string) {
  return prisma.userBlock.deleteMany({
    where: { blockerId, blockedId },
  });
}

export async function isUserBlocked(viewerId: string, userId: string): Promise<boolean> {
  const block = await prisma.userBlock.findFirst({
    where: { blockerId: viewerId, blockedId: userId },
  });

  return !!block;
}

export async function reportUser(reporterId: string, reportedId: string, reason: string) {
  return prisma.userReport.create({
    data: {
      reporterId,
      reportedId,
      reason,
      status: 'PENDING',
    },
  });
}

export async function getInfluencerStatus(userId: string) {
  const followers = await prisma.userFollow.count({
    where: { followeeId: userId },
  });

  const engagement = await prisma.activityLog.count({
    where: {
      userId,
      action: { in: ['LIKE', 'COMMENT', 'SHARE'] },
      timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  return {
    isInfluencer: followers > 1000,
    followerCount: followers,
    monthlyEngagement: engagement,
    score: Math.min(100, (followers / 1000) * 50 + (engagement / 100) * 50),
  };
}

export async function getRecommendations(userId: string, limit = 10) {
  const userFollowing = await prisma.userFollow.findMany({
    where: { followerId: userId },
    select: { followeeId: true },
  });

  const followingIds = userFollowing.map(f => f.followeeId);

  return prisma.user.findMany({
    where: {
      id: { notIn: [userId, ...followingIds] },
    },
    select: { id: true, displayName: true, avatar: true },
    take: limit,
  });
}
