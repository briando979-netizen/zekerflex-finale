import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { getMessageQueue, assignMessage, respondToMessage, getResponseStats } from '@/lib/social/community';
import { z } from 'zod';

const messageSchema = z.object({
  status: z.enum(['new', 'assigned', 'responded', 'resolved']).optional(),
});

const assignSchema = z.object({
  messageId: z.string(),
  assignedTo: z.string(),
});

const respondSchema = z.object({
  messageId: z.string(),
  response: z.string(),
  platform: z.enum(['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok']),
});

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') as any) || 'new';
    const view = searchParams.get('view');

    if (view === 'stats') {
      const days = parseInt(searchParams.get('days') || '30');
      const stats = await getResponseStats(principal.tenantId, days);
      return NextResponse.json({ stats });
    }

    const messages = await getMessageQueue(principal.tenantId, status);

    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    if (body.messageId && body.assignedTo) {
      const { messageId, assignedTo } = assignSchema.parse(body);
      await assignMessage(messageId, assignedTo);
      return NextResponse.json({ success: true });
    }

    if (body.messageId && body.response) {
      const { messageId, response, platform } = respondSchema.parse(body);
      await respondToMessage(messageId, response, platform);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process message' }, { status: 400 });
  }
}
