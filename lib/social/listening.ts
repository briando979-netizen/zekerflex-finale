import { prisma } from '@/lib/prisma';
import { SocialListen, SocialPlatform } from './types';

export async function trackMentions(
  tenantId: string,
  platform: SocialPlatform,
  keyword: string
): Promise<SocialListen[]> {
  const mentions: SocialListen[] = [];

  switch (platform) {
    case 'twitter':
      mentions.push(...(await trackTwitterMentions(tenantId, keyword)));
      break;
    case 'facebook':
      mentions.push(...(await trackFacebookMentions(tenantId, keyword)));
      break;
    case 'instagram':
      mentions.push(...(await trackInstagramMentions(tenantId, keyword)));
      break;
    case 'linkedin':
      mentions.push(...(await trackLinkedInMentions(tenantId, keyword)));
      break;
  }

  for (const mention of mentions) {
    await prisma.socialListen.upsert({
      where: { id: mention.id },
      update: mention,
      create: { ...mention, tenantId },
    });
  }

  return mentions;
}

async function trackTwitterMentions(tenantId: string, keyword: string): Promise<SocialListen[]> {
  const account = await prisma.socialAccount.findFirst({
    where: { tenantId, platform: 'twitter' },
  });

  if (!account) return [];

  const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(keyword)}&max_results=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const sentiment = analyzeSentiment(keyword);

  return (
    data.data?.map((tweet: any) => ({
      id: `twitter-${tweet.id}`,
      platform: 'twitter' as SocialPlatform,
      mention: keyword,
      context: tweet.text,
      sentiment,
      author: tweet.author_id,
      createdAt: new Date(tweet.created_at),
      engaged: false,
    })) || []
  );
}

async function trackFacebookMentions(tenantId: string, keyword: string): Promise<SocialListen[]> {
  const account = await prisma.socialAccount.findFirst({
    where: { tenantId, platform: 'facebook' },
  });

  if (!account) return [];

  const url = `https://graph.facebook.com/v18.0/${account.platformId}/feed?fields=message,created_time&access_token=${account.accessToken}`;
  const res = await fetch(url);

  if (!res.ok) return [];

  const data = await res.json();
  const sentiment = analyzeSentiment(keyword);

  return (
    data.data
      ?.filter((post: any) => post.message?.includes(keyword))
      .map((post: any) => ({
        id: `facebook-${post.id}`,
        platform: 'facebook' as SocialPlatform,
        mention: keyword,
        context: post.message,
        sentiment,
        author: post.from?.name || 'Unknown',
        createdAt: new Date(post.created_time),
        engaged: false,
      })) || []
  );
}

async function trackInstagramMentions(tenantId: string, keyword: string): Promise<SocialListen[]> {
  const account = await prisma.socialAccount.findFirst({
    where: { tenantId, platform: 'instagram' },
  });

  if (!account) return [];

  const url = `https://graph.instagram.com/v18.0/${account.platformId}/ig_hashtag_search?user_id=${account.platformId}&fields=id,name&access_token=${account.accessToken}`;
  const res = await fetch(url);

  if (!res.ok) return [];

  const data = await res.json();
  const sentiment = analyzeSentiment(keyword);

  return (
    data.data?.map((tag: any) => ({
      id: `instagram-${tag.id}`,
      platform: 'instagram' as SocialPlatform,
      mention: keyword,
      context: tag.name,
      sentiment,
      author: 'Instagram User',
      createdAt: new Date(),
      engaged: false,
    })) || []
  );
}

async function trackLinkedInMentions(tenantId: string, keyword: string): Promise<SocialListen[]> {
  const account = await prisma.socialAccount.findFirst({
    where: { tenantId, platform: 'linkedin' },
  });

  if (!account) return [];

  const url = `https://api.linkedin.com/v2/search?q=${encodeURIComponent(keyword)}&count=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const sentiment = analyzeSentiment(keyword);

  return (
    data.elements?.map((item: any, idx: number) => ({
      id: `linkedin-${idx}`,
      platform: 'linkedin' as SocialPlatform,
      mention: keyword,
      context: item.text || item.title,
      sentiment,
      author: item.name || 'Unknown',
      createdAt: new Date(),
      engaged: false,
    })) || []
  );
}

export async function detectTrends(tenantId: string, platform: SocialPlatform): Promise<string[]> {
  const mentions = await prisma.socialListen.findMany({
    where: { tenantId, platform },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const words = mentions
    .flatMap((m) => m.context.toLowerCase().split(/\s+/))
    .filter((w) => w.length > 3);

  const frequency: Record<string, number> = {};
  for (const word of words) {
    frequency[word] = (frequency[word] || 0) + 1;
  }

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

export async function markEngaged(listenId: string): Promise<void> {
  await prisma.socialListen.update({
    where: { id: listenId },
    data: { engaged: true },
  });
}

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positive = ['love', 'great', 'awesome', 'excellent', 'amazing', 'fantastic'];
  const negative = ['hate', 'bad', 'terrible', 'awful', 'horrible', 'worst'];

  const lower = text.toLowerCase();
  const posCount = positive.filter((w) => lower.includes(w)).length;
  const negCount = negative.filter((w) => lower.includes(w)).length;

  if (posCount > negCount) return 'positive';
  if (negCount > posCount) return 'negative';
  return 'neutral';
}
