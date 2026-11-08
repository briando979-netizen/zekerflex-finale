import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { getWorkerProfileStats, updateWorkerStats } from '@/lib/worker-analytics/profile-stats';
import { calculatePerformanceMetrics } from '@/lib/worker-analytics/performance-metrics';
import { getWorkerSkills, addSkillToWorker } from '@/lib/worker-analytics/skill-tracking';
import { analyzeEarnings } from '@/lib/worker-analytics/earnings-analysis';
import { predictChurnRisk } from '@/lib/worker-analytics/retention-prediction';
import { calculateEngagementMetrics } from '@/lib/worker-analytics/engagement';
import { AppError, toErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get('type') || 'all';

    if (type === 'profile' || type === 'all') {
      const stats = await getWorkerProfileStats(principal.userId);
      if (type === 'profile') return NextResponse.json({ stats });
    }

    if (type === 'performance' || type === 'all') {
      const metrics = await calculatePerformanceMetrics(principal.userId);
      if (type === 'performance') return NextResponse.json({ metrics });
    }

    if (type === 'skills' || type === 'all') {
      const skills = await getWorkerSkills(principal.userId);
      if (type === 'skills') return NextResponse.json({ skills });
    }

    if (type === 'earnings' || type === 'all') {
      const earnings = await analyzeEarnings(principal.userId);
      if (type === 'earnings') return NextResponse.json({ earnings });
    }

    if (type === 'churn' || type === 'all') {
      const churn = await predictChurnRisk(principal.userId);
      if (type === 'churn') return NextResponse.json({ churn });
    }

    if (type === 'engagement' || type === 'all') {
      const engagement = await calculateEngagementMetrics(principal.userId);
      if (type === 'engagement') return NextResponse.json({ engagement });
    }

    // Return all analytics
    const [stats, metrics, skills, earnings, churn, engagement] = await Promise.all([
      getWorkerProfileStats(principal.userId),
      calculatePerformanceMetrics(principal.userId),
      getWorkerSkills(principal.userId),
      analyzeEarnings(principal.userId),
      predictChurnRisk(principal.userId),
      calculateEngagementMetrics(principal.userId),
    ]);

    return NextResponse.json({
      profile: stats,
      performance: metrics,
      skills,
      earnings,
      churn,
      engagement,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action } = body;

    if (action === 'update-stats') {
      await updateWorkerStats(principal.userId);
      return NextResponse.json({ updated: true });
    }

    if (action === 'add-skill') {
      const { skillName, level } = body;
      if (!skillName || !level) {
        throw AppError.validation('skillName and level required');
      }
      await addSkillToWorker(principal.userId, skillName, level);
      return NextResponse.json({ added: true }, { status: 201 });
    }

    throw AppError.validation('Unknown action');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
