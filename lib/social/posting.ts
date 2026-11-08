import { prisma } from '@/lib/prisma';
import { SocialPost, SocialPlatform, BEST_POSTING_TIMES } from './types';
import sharp from 'sharp';

export async function createPost(
  tenantId: string,
  content: string,
  mediaUrls: string[],
  platforms: SocialPlatform[],
  scheduledAt: Date,
  hashtags: string[] = []
): Promise<SocialPost> {
  const resizedMedia = await Promise.all(
    mediaUrls.map(async (url) => {
      try {
        const buffer = await fetch(url).then((r) => r.arrayBuffer());
        const resized = await sharp(Buffer.from(buffer))
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        return `data:image/webp;base64,${resized.toString('base64')}`;
      } catch {
        return url;
      }
    })
  );

  const post: SocialPost = {
    id: crypto.randomUUID(),
    content,
    mediaUrls: resizedMedia,
    scheduledAt,
    platforms,
    hashtags,
    status: 'draft',
    engagement: { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, clicks: 0 },
  };

  await prisma.socialPost.create({
    data: {
      id: post.id,
      tenantId,
      content,
      mediaUrls: resizedMedia,
      platforms,
      hashtags,
      scheduledAt,
      status: 'draft',
    },
  });

  return post;
}

export async function schedulePost(postId: string, scheduledAt: Date): Promise<void> {
  await prisma.socialPost.update({
    where: { id: postId },
    data: { scheduledAt, status: 'scheduled' },
  });
}

export async function publishPost(postId: string, tenantId: string): Promise<void> {
  const post = await prisma.socialPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error('Post not found');

  for (const platform of post.platforms) {
    try {
      await publishToPlatform(platform, tenantId, post);
    } catch (err) {
      console.error(`Failed to publish to ${platform}:`, err);
    }
  }

  await prisma.socialPost.update({
    where: { id: postId },
    data: { status: 'published', publishedAt: new Date() },
  });
}

async function publishToPlatform(platform: SocialPlatform, tenantId: string, post: any): Promise<void> {
  const account = await prisma.socialAccount.findFirst({
    where: { tenantId, platform },
  });

  if (!account) throw new Error(`No ${platform} account connected`);

  const postContent = `${post.content}\n\n${post.hashtags.map((h: string) => `#${h}`).join(' ')}`;

  switch (platform) {
    case 'facebook':
      await publishToFacebook(account, postContent, post.mediaUrls);
      break;
    case 'instagram':
      await publishToInstagram(account, postContent, post.mediaUrls);
      break;
    case 'twitter':
      await publishToTwitter(account, postContent, post.mediaUrls);
      break;
    case 'linkedin':
      await publishToLinkedIn(account, postContent, post.mediaUrls);
      break;
    case 'tiktok':
      await publishToTikTok(account, postContent, post.mediaUrls);
      break;
    case 'youtube':
      await publishToYouTube(account, postContent, post.mediaUrls);
      break;
  }
}

async function publishToFacebook(account: any, content: string, media: string[]): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${account.platformId}/feed`;
  await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ message: content, access_token: account.accessToken }),
  });
}

async function publishToInstagram(account: any, content: string, media: string[]): Promise<void> {
  const url = `https://graph.instagram.com/v18.0/${account.platformId}/media`;
  await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ caption: content, media_type: 'IMAGE', image_url: media[0], access_token: account.accessToken }),
  });
}

async function publishToTwitter(account: any, content: string, media: string[]): Promise<void> {
  const url = 'https://api.twitter.com/2/tweets';
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: content }),
  });
}

async function publishToLinkedIn(account: any, content: string, media: string[]): Promise<void> {
  const url = 'https://api.linkedin.com/v2/ugcPosts';
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ specificContent: { 'com.linkedin.ugc': { content: { media: media.map((m) => ({ status: 'READY', description: { text: content } } )) } } } }),
  });
}

async function publishToTikTok(account: any, content: string, media: string[]): Promise<void> {
  const url = 'https://open.tiktok.com/api/v1/share/video/upload/';
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}` },
    body: JSON.stringify({ video: media[0], caption: content }),
  });
}

async function publishToYouTube(account: any, content: string, media: string[]): Promise<void> {
  const url = 'https://www.googleapis.com/youtube/v3/videos?part=snippet';
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { title: content, description: content, categoryId: '22' } }),
  });
}

export async function suggestBestTime(platforms: SocialPlatform[]): Promise<Date> {
  const now = new Date();
  const times = platforms.flatMap((p) => BEST_POSTING_TIMES[p]);
  const bestHour = Math.max(...times);
  const suggested = new Date(now);
  suggested.setHours(bestHour, 0, 0, 0);
  if (suggested < now) suggested.setDate(suggested.getDate() + 1);
  return suggested;
}
