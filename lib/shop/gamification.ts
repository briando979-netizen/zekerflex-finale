// Gamification and engagement mechanics

export interface GamificationProfile {
  customerId: string;
  points: number;
  level: number;
  badges: Badge[];
  streaks: Streak[];
  achievements: Achievement[];
  leaderboardRank?: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: string; // "10 purchases", "500 points", etc.
  earnedAt: Date;
}

export interface Streak {
  type: "daily_visit" | "weekly_purchase" | "referral" | "review";
  count: number;
  lastActivityDate: Date;
  reward?: number; // bonus points at milestone
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  progress: number; // 0-100
  reward: number; // points or discount code
  unlockedAt?: Date;
}

export interface Leaderboard {
  type: "points" | "purchases" | "referrals" | "reviews";
  period: "weekly" | "monthly" | "allTime";
  entries: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  customerId: string;
  name: string;
  score: number;
  reward?: number; // cents for top 3
}

export const GAMIFICATION_MECHANICS = [
  { type: "daily_login", points: 10 },
  { type: "first_purchase", points: 100 },
  { type: "review", points: 25 },
  { type: "referral_accepted", points: 50 },
  { type: "milestone_streak", points: 50 },
  { type: "birthday_bonus", points: 50 },
];

export async function awardPoints(
  customerId: string,
  action: string,
  points: number
): Promise<void> {
  // TODO: Add points and check for badges/achievements
}

export async function getLeaderboard(
  type: string,
  period: string,
  limit: number = 100
): Promise<Leaderboard> {
  return {
    type: type as any,
    period: period as any,
    entries: [],
  };
}

export async function checkAchievements(customerId: string): Promise<Achievement[]> {
  // TODO: Check for newly unlocked achievements
  return [];
}

export async function redeemPoints(
  customerId: string,
  points: number
): Promise<{ discount: number; expiresAt: Date }> {
  // TODO: Convert points to discount (100 pts = €5)
  return { discount: Math.floor((points / 100) * 5), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) };
}
