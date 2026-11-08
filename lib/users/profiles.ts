import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { z } from 'zod';

const ProfileSchema = z.object({
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  displayName: z.string().min(1).max(100),
  socialLinks: z.record(z.string().url()).optional(),
  verificationBadges: z.array(z.enum(['email', 'phone', 'identity', 'business'])).optional(),
});

type Profile = z.infer<typeof ProfileSchema>;

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      bio: true,
      avatar: true,
      socialLinks: true,
      verificationBadges: true,
      createdAt: true,
    },
  });

  if (!user) throw AppError.notFound('User not found');
  return user;
}

export async function updateProfile(userId: string, data: Partial<Profile>) {
  const validated = ProfileSchema.partial().parse(data);

  return prisma.user.update({
    where: { id: userId },
    data: validated,
    select: { id: true, displayName: true, bio: true, avatar: true },
  });
}

export async function uploadAvatar(userId: string, url: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { avatar: url },
  });
}

export async function addVerificationBadge(userId: string, badge: 'email' | 'phone' | 'identity' | 'business') {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found');

  const badges = new Set(user.verificationBadges || []);
  badges.add(badge);

  return prisma.user.update({
    where: { id: userId },
    data: { verificationBadges: Array.from(badges) },
  });
}
