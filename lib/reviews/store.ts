import { randomUUID } from "node:crypto";
import { kvAppend, kvGet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Two-way reviews — an employer reviews a freelancer after a completed shift,
// a freelancer reviews the company they worked for. Postgres-backed
// (KeyValueStore, key "reviews:<freelancer|company>-<id>", array value) — was
// an append-only local .jsonl file, unreliable on Vercel serverless.
// ---------------------------------------------------------------------------

export type ReviewSubject = "freelancer" | "company";

export interface Review {
  id: string;
  subjectType: ReviewSubject;
  subjectId: string; // userId (freelancer) or tenantId (company)
  authorId: string;
  authorName: string;
  authorRole: "employer" | "freelancer";
  rating: number; // 1..5
  text: string;
  shiftId?: string;
  shiftTitle?: string;
  at: string;
}

export interface ReviewSummary {
  average: number;
  count: number;
  /** rating -> count, 5..1 */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  recent: Review[]; // last 6 months, newest first
}

const key = (type: ReviewSubject, id: string) => `reviews:${type}-${id}`;

export async function addReview(
  input: Omit<Review, "id" | "at">,
): Promise<Review> {
  const review: Review = {
    ...input,
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    text: input.text.trim().slice(0, 1500),
    id: randomUUID().slice(0, 12),
    at: new Date().toISOString(),
  };
  await kvAppend(key(input.subjectType, input.subjectId), review);
  return review;
}

export async function listReviews(type: ReviewSubject, id: string): Promise<Review[]> {
  const rows = (await kvGet<Review[]>(key(type, id))) ?? [];
  return [...rows].sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function reviewSummary(
  type: ReviewSubject,
  id: string,
  monthsBack = 6,
): Promise<ReviewSummary> {
  const all = await listReviews(type, id);
  const distribution: ReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of all) distribution[Math.min(5, Math.max(1, r.rating)) as 1 | 2 | 3 | 4 | 5]++;
  const cutoff = Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000;
  const recent = all.filter((r) => new Date(r.at).getTime() >= cutoff);
  const average = all.length ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0;
  return {
    average: Math.round(average * 10) / 10,
    count: all.length,
    distribution,
    recent,
  };
}

export async function hasReviewed(
  type: ReviewSubject,
  id: string,
  authorId: string,
  shiftId?: string,
): Promise<boolean> {
  const all = await listReviews(type, id);
  return all.some((r) => r.authorId === authorId && (!shiftId || r.shiftId === shiftId));
}

/** The review a specific author left for this subject (optionally for one shift). */
export async function getReviewBy(
  type: ReviewSubject,
  id: string,
  authorId: string,
  shiftId?: string,
): Promise<Review | null> {
  const all = await listReviews(type, id);
  return (
    all.find((r) => r.authorId === authorId && (!shiftId || r.shiftId === shiftId)) ?? null
  );
}
