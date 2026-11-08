import { prisma } from '@/lib/prisma';

export interface PerformanceMetrics {
  workerId: string;
  qualityScore: number;
  punctualityScore: number;
  feedbackScore: number;
  overallScore: number;
  recentFeedback: string[];
}

export async function calculatePerformanceMetrics(workerId: string): Promise<PerformanceMetrics> {
  const assignments = await prisma.assignment.findMany({
    where: { freelancerId: workerId, status: 'COMPLETED' },
    include: { feedback: true },
  });

  const qualityRatings = assignments.map(a => a.rating || 0).filter(r => r > 0);
  const qualityScore = qualityRatings.length > 0 ? qualityRatings.reduce((a, b) => a + b) / qualityRatings.length : 0;

  const onTime = assignments.filter(a => {
    const expectedEnd = new Date(a.scheduledStart);
    expectedEnd.setMinutes(expectedEnd.getMinutes() + a.durationMinutes);
    return a.completedAt && new Date(a.completedAt) <= expectedEnd;
  }).length;
  const punctualityScore = assignments.length > 0 ? (onTime / assignments.length) * 100 : 0;

  const allFeedback = assignments.flatMap(a => a.feedback || []).map(f => f.comment || '');
  const feedbackScore = allFeedback.length > 0 ? 80 : 0;

  const overallScore = (qualityScore * 0.5 + (punctualityScore / 20) * 0.3 + (feedbackScore / 100) * 0.2);

  return {
    workerId,
    qualityScore: Math.round(qualityScore * 100) / 100,
    punctualityScore: Math.round(punctualityScore * 100) / 100,
    feedbackScore: Math.round(feedbackScore * 100) / 100,
    overallScore: Math.round(overallScore * 100) / 100,
    recentFeedback: allFeedback.slice(-5),
  };
}
