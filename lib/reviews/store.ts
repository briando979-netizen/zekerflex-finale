import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Two-way reviews — an employer reviews a freelancer after a completed shift,
// a freelancer reviews the company they worked for. Append-only, filesystem:
//   storage/reviews/freelancer-<userId>.jsonl
//   storage/reviews/company-<tenantId>.jsonl
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

const dir = () => join(process.cwd(), "storage", "reviews");
const file = (type: ReviewSubject, id: string) =>
  join(dir(), `${type}-${id.replace(/[^a-z0-9-]/gi, "")}.jsonl`);

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
  await mkdir(dir(), { recursive: true });
  await appendFile(file(input.subjectType, input.subjectId), JSON.stringify(review) + "\n", "utf8");
  return review;
}

export async function listReviews(type: ReviewSubject, id: string): Promise<Review[]> {
  const p = file(type, id);
  if (!existsSync(p)) return [];
  const lines = (await readFile(p, "utf8")).split("\n").filter(Boolean);
  const out: Review[] = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l) as Review);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
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
