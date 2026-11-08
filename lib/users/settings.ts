import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const SettingsSchema = z.object({
  privacyLevel: z.enum(['public', 'friends', 'private']).default('public'),
  emailNotifications: z.boolean().default(true),
  pushNotifications: z.boolean().default(true),
  smsNotifications: z.boolean().default(false),
  dataSharing: z.boolean().default(false),
  twoFactorEnabled: z.boolean().default(false),
  apiKeysRotationDays: z.number().int().positive().default(90),
});

type UserSettings = z.infer<typeof SettingsSchema>;

export async function getSettings(userId: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  return settings || SettingsSchema.parse({});
}

export async function updateSettings(userId: string, data: Partial<UserSettings>) {
  const validated = SettingsSchema.partial().parse(data);

  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...validated },
    update: validated,
  });
}

export async function toggleNotification(userId: string, type: 'email' | 'push' | 'sms', enabled: boolean) {
  const key = `${type}Notifications`;
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId, [key]: enabled },
    update: { [key]: enabled },
  });
}

export async function rotateApiKey(userId: string) {
  const newKey = `zf_${Buffer.from(Math.random().toString()).toString('hex').slice(0, 32)}`;

  return prisma.userApiKey.create({
    data: {
      userId,
      key: newKey,
      lastRotatedAt: new Date(),
    },
  });
}

export async function enableTwoFactor(userId: string, secret: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId, twoFactorEnabled: true },
    update: { twoFactorEnabled: true },
  });
}
