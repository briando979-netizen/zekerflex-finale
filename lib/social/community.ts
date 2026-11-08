import { prisma } from '@/lib/prisma';
import { CommunityMessage, SocialPlatform } from './types';

export async function getMessageQueue(
  tenantId: string,
  status: 'new' | 'assigned' | 'responded' | 'resolved' = 'new'
): Promise<CommunityMessage[]> {
  const messages = await prisma.communityMessage.findMany({
    where: { tenantId, status },
    orderBy: { receivedAt: 'desc' },
  });

  return messages;
}

export async function assignMessage(messageId: string, assignedTo: string): Promise<void> {
  await prisma.communityMessage.update({
    where: { id: messageId },
    data: { assignedTo, status: 'assigned' },
  });
}

export async function respondToMessage(
  messageId: string,
  response: string,
  platform: SocialPlatform
): Promise<void> {
  const message = await prisma.communityMessage.findUnique({
    where: { id: messageId },
  });

  if (!message) throw new Error('Message not found');

  const account = await prisma.socialAccount.findFirst({
    where: { tenantId: message.tenantId, platform },
  });

  if (!account) throw new Error(`No ${platform} account connected`);

  switch (platform) {
    case 'facebook':
      await sendFacebookMessage(account, message.platformId, response);
      break;
    case 'instagram':
      await sendInstagramMessage(account, message.platformId, response);
      break;
    case 'twitter':
      await sendTwitterMessage(account, message.author, response);
      break;
    case 'linkedin':
      await sendLinkedInMessage(account, message.platformId, response);
      break;
    case 'tiktok':
      await sendTikTokMessage(account, message.platformId, response);
      break;
  }

  await prisma.communityMessage.update({
    where: { id: messageId },
    data: { response, status: 'responded' },
  });
}

async function sendFacebookMessage(account: any, recipientId: string, message: string): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${account.platformId}/messages`;
  await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: account.accessToken,
    }),
  });
}

async function sendInstagramMessage(account: any, recipientId: string, message: string): Promise<void> {
  const url = `https://graph.instagram.com/v18.0/${account.platformId}/messages`;
  await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: account.accessToken,
    }),
  });
}

async function sendTwitterMessage(account: any, username: string, message: string): Promise<void> {
  const url = 'https://api.twitter.com/2/direct_messages';
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation_type: 'Direct Message Thread',
      participant_ids: [username],
      message: { text: message },
    }),
  });
}

async function sendLinkedInMessage(account: any, recipientId: string, message: string): Promise<void> {
  const url = 'https://api.linkedin.com/v2/messaging/conversations';
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipients: [{ id: recipientId }],
      subject: 'Message',
      body: message,
    }),
  });
}

async function sendTikTokMessage(account: any, recipientId: string, message: string): Promise<void> {
  const url = 'https://open.tiktok.com/api/v1/messages/send';
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}` },
    body: JSON.stringify({
      to_user_id: recipientId,
      text: message,
    }),
  });
}

export async function getCannedResponses(tenantId: string): Promise<{ id: string; title: string; text: string }[]> {
  const responses = await prisma.cannedResponse.findMany({
    where: { tenantId },
  });

  return responses;
}

export async function addCannedResponse(
  tenantId: string,
  title: string,
  text: string
): Promise<{ id: string; title: string; text: string }> {
  const response = await prisma.cannedResponse.create({
    data: { tenantId, title, text },
  });

  return response;
}

export async function escalateMessage(messageId: string, reason: string): Promise<void> {
  const message = await prisma.communityMessage.findUnique({
    where: { id: messageId },
  });

  if (!message) throw new Error('Message not found');

  await prisma.communityMessage.update({
    where: { id: messageId },
    data: { status: 'resolved' },
  });

  await prisma.escalation.create({
    data: {
      tenantId: message.tenantId,
      messageId,
      reason,
      status: 'open',
    },
  });
}

export async function getResponseStats(tenantId: string, days: number = 30): Promise<{
  avgResponseTime: number;
  responseRate: number;
  resolutionRate: number;
}> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const messages = await prisma.communityMessage.findMany({
    where: {
      tenantId,
      receivedAt: { gte: startDate },
    },
  });

  const responded = messages.filter((m) => m.response);
  const resolved = messages.filter((m) => m.status === 'resolved');

  const responseTimes = messages
    .filter((m) => m.response)
    .map((m) => {
      const time = new Date(m.receivedAt).getTime();
      const responseTime = new Date(m.receivedAt).getTime();
      return responseTime - time;
    });

  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  return {
    avgResponseTime,
    responseRate: messages.length > 0 ? (responded.length / messages.length) * 100 : 0,
    resolutionRate: messages.length > 0 ? (resolved.length / messages.length) * 100 : 0,
  };
}
