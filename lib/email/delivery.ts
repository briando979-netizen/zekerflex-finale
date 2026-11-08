import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

interface SendGridEmail {
  to: Array<{ email: string; name?: string }>;
  from: { email: string; name: string };
  subject: string;
  html: string;
  text?: string;
  replyTo?: { email: string };
  customArgs?: Record<string, string>;
}

interface MailgunMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  "h:Reply-To"?: string;
  "v:campaign-id"?: string;
}

export async function sendEmailViaSendGrid(
  email: SendGridEmail,
  apiKey: string
) {
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: email.to,
            subject: email.subject,
            customArgs: email.customArgs,
          },
        ],
        from: email.from,
        content: [
          {
            type: "text/html",
            value: email.html,
          },
          ...(email.text ? [{ type: "text/plain", value: email.text }] : []),
        ],
        replyTo: email.replyTo,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `SendGrid error: ${response.status} ${response.statusText}`
      );
    }

    const headers = response.headers;
    const messageId = headers.get("X-Message-Id");
    return { success: true, messageId };
  } catch (err) {
    console.error("SendGrid send error:", err);
    throw AppError.internal("Failed to send email via SendGrid");
  }
}

export async function sendEmailViaMailgun(
  email: MailgunMessage,
  domain: string,
  apiKey: string
) {
  try {
    const formData = new FormData();
    formData.append("from", email.from);
    formData.append("to", email.to);
    formData.append("subject", email.subject);
    formData.append("html", email.html);
    if (email.text) formData.append("text", email.text);
    if (email["h:Reply-To"]) formData.append("h:Reply-To", email["h:Reply-To"]);
    if (email["v:campaign-id"])
      formData.append("v:campaign-id", email["v:campaign-id"]);

    const auth = `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`;
    const response = await fetch(
      `https://api.mailgun.net/v3/${domain}/messages`,
      {
        method: "POST",
        headers: { Authorization: auth },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Mailgun error: ${response.status}`);
    }

    const data = (await response.json()) as { id: string };
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error("Mailgun send error:", err);
    throw AppError.internal("Failed to send email via Mailgun");
  }
}

export async function recordEmailSend(
  campaignId: string,
  subscriberId: string,
  email: string,
  externalId?: string
) {
  return prisma.emailSend.create({
    data: {
      campaignId,
      subscriberId,
      email,
      status: "SUBSCRIBED",
      externalId,
    },
  });
}

export async function recordEmailOpen(
  campaignId: string,
  subscriberId: string
) {
  await prisma.emailSend.updateMany({
    where: { campaignId, subscriberId },
    data: { opened: true, openedAt: new Date() },
  });

  await prisma.emailSubscriber.update({
    where: { id: subscriberId },
    data: {
      engagementScore: { increment: 10 },
      lastEngagementAt: new Date(),
    },
  });
}

export async function recordEmailClick(
  campaignId: string,
  subscriberId: string
) {
  await prisma.emailSend.updateMany({
    where: { campaignId, subscriberId },
    data: { clicked: true, clickedAt: new Date() },
  });

  await prisma.emailSubscriber.update({
    where: { id: subscriberId },
    data: {
      engagementScore: { increment: 25 },
      lastEngagementAt: new Date(),
    },
  });
}

export async function recordEmailBounce(
  email: string,
  reason: string,
  bounceType: "permanent" | "temporary" = "permanent"
) {
  await prisma.emailSubscriber.updateMany({
    where: { email },
    data: {
      status: bounceType === "permanent" ? "BOUNCED" : "INACTIVE",
      bounceReason: reason,
    },
  });
}

export async function recordEmailComplaint(email: string) {
  await prisma.emailSubscriber.updateMany({
    where: { email },
    data: { status: "COMPLAINED" },
  });
}

export async function getUnsubscribeLink(
  campaignId: string,
  subscriberId: string
): Promise<string> {
  return `/api/email/unsubscribe?campaign=${campaignId}&subscriber=${subscriberId}`;
}

export async function validateEmailAddress(email: string): Promise<boolean> {
  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function isEmailSupressed(email: string): Promise<boolean> {
  const suppressed = await prisma.emailSubscriber.findFirst({
    where: {
      email,
      status: { in: ["BOUNCED", "COMPLAINED", "UNSUBSCRIBED"] },
    },
  });
  return !!suppressed;
}
