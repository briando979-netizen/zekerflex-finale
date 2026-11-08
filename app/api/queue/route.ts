import { NextRequest, NextResponse } from 'next/server';
import { enqueueTask, getQueueStats, queueMonitor } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { type, payload, priority = 'medium' } = await request.json();

    if (!type) {
      return NextResponse.json({ error: 'Task type required' }, { status: 400 });
    }

    const taskId = await enqueueTask(type, payload, priority);
    queueMonitor.recordJobStart(taskId, type);

    return NextResponse.json({ taskId, status: 'queued' }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'stats') {
      const stats = await getQueueStats();
      return NextResponse.json(stats);
    }

    if (action === 'metrics') {
      const metrics = queueMonitor.getMetrics();
      return NextResponse.json(metrics);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
