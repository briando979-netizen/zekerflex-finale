// Social media management types and constants

export type SocialPlatform = 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'tiktok' | 'youtube';

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  platformId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  followers: number;
  username: string;
}

export interface SocialPost {
  id: string;
  content: string;
  mediaUrls: string[];
  scheduledAt: Date;
  platforms: SocialPlatform[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  publishedAt?: Date;
  hashtags: string[];
  engagement: PostEngagement;
}

export interface PostEngagement {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  clicks: number;
}

export interface SocialListen {
  id: string;
  platform: SocialPlatform;
  mention: string;
  context: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  author: string;
  createdAt: Date;
  engaged: boolean;
}

export interface CommunityMessage {
  id: string;
  platform: SocialPlatform;
  platformId: string;
  author: string;
  content: string;
  receivedAt: Date;
  status: 'new' | 'assigned' | 'responded' | 'resolved';
  assignedTo?: string;
  response?: string;
}

export const PLATFORM_CONFIG: Record<SocialPlatform, { name: string; icon: string }> = {
  facebook: { name: 'Facebook', icon: 'facebook' },
  instagram: { name: 'Instagram', icon: 'instagram' },
  twitter: { name: 'X (Twitter)', icon: 'twitter' },
  linkedin: { name: 'LinkedIn', icon: 'linkedin' },
  tiktok: { name: 'TikTok', icon: 'tiktok' },
  youtube: { name: 'YouTube', icon: 'youtube' },
};

export const BEST_POSTING_TIMES: Record<SocialPlatform, number[]> = {
  facebook: [10, 14, 19],
  instagram: [11, 13, 18, 21],
  twitter: [9, 12, 17, 20],
  linkedin: [8, 12, 17],
  tiktok: [6, 10, 16, 23],
  youtube: [11, 14, 17],
};
