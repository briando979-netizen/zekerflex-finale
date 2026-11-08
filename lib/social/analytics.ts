import { prisma } from '@/lib/prisma';
import { SocialPlatform, PostEngagement } from './types';

export async function getPostAnalytics(postId: string): Promise<PostEngagement> {
  const post = await prisma.socialPost.findUnique({
    where: { id: postId },
    select: { engagement: true },
  });

  return (
    post?.engagement || {
      likes: 0,
      comments: 0,
      shares: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
    }
  );
}

export async function updateEngagementMetrics(
  tenantId: string,
  platform: SocialPlatform
): Promise<void> {
  const account = await prisma.socialAccount.findFirst({
    where: { tenantId, platform },
  });

  if (!account) return;

  const posts = await prisma.socialPost.findMany({
    where: { tenantId, platforms: { has: platform } },
  });

  for (const post of posts) {
    const metrics = await fetchPlatformMetrics(platform, account, post);
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { engagement: metrics },
    });
  }
}

async function fetchPlatformMetrics(
  platform: SocialPlatform,
  account: any,
  post: any
): Promise<PostEngagement> {
  let metrics: PostEngagement = {
    likes: 0,
    comments: 0,
    shares: 0,
    reach: 0,
    impressions: 0,
    clicks: 0,
  };

  try {
    switch (platform) {
      case 'facebook':
        metrics = await fetchFacebookMetrics(account, post);
        break;
      case 'instagram':
        metrics = await fetchInstagramMetrics(account, post);
        break;
      case 'twitter':
        metrics = await fetchTwitterMetrics(account, post);
        break;
      case 'linkedin':
        metrics = await fetchLinkedInMetrics(account, post);
        break;
      case 'tiktok':
        metrics = await fetchTikTokMetrics(account, post);
        break;
      case 'youtube':
        metrics = await fetchYouTubeMetrics(account, post);
        break;
    }
  } catch (err) {
    console.error(`Error fetching ${platform} metrics:`, err);
  }

  return metrics;
}

async function fetchFacebookMetrics(account: any, post: any): Promise<PostEngagement> {
  const url = `https://graph.facebook.com/v18.0/${post.id}?fields=insights.metric(engagement,impressions,reach)&access_token=${account.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();

  const insights = data.insights?.data || [];
  return {
    likes: insights.find((i: any) => i.name === 'engagement')?.values[0]?.value || 0,
    comments: 0,
    shares: 0,
    reach: insights.find((i: any) => i.name === 'reach')?.values[0]?.value || 0,
    impressions: insights.find((i: any) => i.name === 'impressions')?.values[0]?.value || 0,
    clicks: 0,
  };
}

async function fetchInstagramMetrics(account: any, post: any): Promise<PostEngagement> {
  const url = `https://graph.instagram.com/v18.0/${post.id}?fields=insights.metric(engagement,impressions,reach)&access_token=${account.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();

  const insights = data.insights?.data || [];
  return {
    likes: insights.find((i: any) => i.name === 'engagement')?.values[0]?.value || 0,
    comments: 0,
    shares: 0,
    reach: insights.find((i: any) => i.name === 'reach')?.values[0]?.value || 0,
    impressions: insights.find((i: any) => i.name === 'impressions')?.values[0]?.value || 0,
    clicks: 0,
  };
}

async function fetchTwitterMetrics(account: any, post: any): Promise<PostEngagement> {
  const url = `https://api.twitter.com/2/tweets/${post.id}?tweet.fields=public_metrics`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });

  const data = await res.json();
  const metrics = data.data?.public_metrics || {};

  return {
    likes: metrics.like_count || 0,
    comments: metrics.reply_count || 0,
    shares: metrics.retweet_count || 0,
    reach: 0,
    impressions: 0,
    clicks: metrics.impression_count || 0,
  };
}

async function fetchLinkedInMetrics(account: any, post: any): Promise<PostEngagement> {
  const url = `https://api.linkedin.com/v2/ugcPosts/${post.id}?projection=(totalShareStatistics)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });

  const data = await res.json();
  const stats = data.totalShareStatistics || {};

  return {
    likes: stats.shareUrnShareStatistics?.[0]?.likeCount || 0,
    comments: stats.shareUrnShareStatistics?.[0]?.commentCount || 0,
    shares: stats.shareUrnShareStatistics?.[0]?.shareCount || 0,
    reach: 0,
    impressions: 0,
    clicks: 0,
  };
}

async function fetchTikTokMetrics(account: any, post: any): Promise<PostEngagement> {
  const url = `https://open.tiktok.com/api/v1/video/${post.id}/stats`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });

  const data = await res.json();
  const stats = data.data || {};

  return {
    likes: stats.like_count || 0,
    comments: stats.comment_count || 0,
    shares: stats.share_count || 0,
    reach: 0,
    impressions: stats.view_count || 0,
    clicks: 0,
  };
}

async function fetchYouTubeMetrics(account: any, post: any): Promise<PostEngagement> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${post.id}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });

  const data = await res.json();
  const stats = data.items?.[0]?.statistics || {};

  return {
    likes: stats.likeCount || 0,
    comments: stats.commentCount || 0,
    shares: 0,
    reach: 0,
    impressions: stats.viewCount || 0,
    clicks: 0,
  };
}

export async function getAggregateAnalytics(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalPosts: number;
  totalEngagement: number;
  avgEngagement: number;
  topPost: any;
}> {
  const posts = await prisma.socialPost.findMany({
    where: {
      tenantId,
      publishedAt: { gte: startDate, lte: endDate },
    },
  });

  const totalEngagement = posts.reduce(
    (sum, p) =>
      sum +
      (p.engagement?.likes || 0) +
      (p.engagement?.comments || 0) +
      (p.engagement?.shares || 0),
    0
  );

  const topPost = posts.reduce((max, p) => {
    const engagement =
      (p.engagement?.likes || 0) +
      (p.engagement?.comments || 0) +
      (p.engagement?.shares || 0);
    const maxEngagement =
      (max.engagement?.likes || 0) +
      (max.engagement?.comments || 0) +
      (max.engagement?.shares || 0);
    return engagement > maxEngagement ? p : max;
  }, posts[0]);

  return {
    totalPosts: posts.length,
    totalEngagement,
    avgEngagement: posts.length > 0 ? totalEngagement / posts.length : 0,
    topPost,
  };
}
