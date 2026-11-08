import { prisma } from "@/lib/prisma";
import { z } from "zod";

const feedbackSchema = z.object({
  type: z.enum(["bug", "feature_request", "general"]),
  message: z.string().min(1).max(5000),
  email: z.string().email().optional(),
  userId: z.string().optional(),
  attachments: z.array(z.string().url()).optional(),
});

type FeedbackInput = z.infer<typeof feedbackSchema>;

// Simple sentiment analysis (basic implementation)
function analyzeSentiment(text: string): string {
  const positive = ["great", "excellent", "love", "amazing", "wonderful"];
  const negative = ["bad", "terrible", "hate", "awful", "horrible"];

  const lower = text.toLowerCase();
  const hasPositive = positive.some((w) => lower.includes(w));
  const hasNegative = negative.some((w) => lower.includes(w));

  if (hasPositive && !hasNegative) return "positive";
  if (hasNegative && !hasPositive) return "negative";
  return "neutral";
}

// Extract category from message
function extractCategory(text: string): string {
  if (text.includes("crash") || text.includes("error")) return "technical_issue";
  if (text.includes("slow") || text.includes("lag")) return "performance";
  if (text.includes("feature")) return "feature";
  if (text.includes("design") || text.includes("ui")) return "design";
  return "general";
}

export async function submitFeedback(tenantId: string, data: FeedbackInput) {
  const validated = feedbackSchema.parse(data);

  const feedback = await prisma.feedback.create({
    data: {
      tenantId,
      type: validated.type,
      message: validated.message,
      email: validated.email,
      userId: validated.userId,
      attachments: validated.attachments || [],
      sentiment: analyzeSentiment(validated.message),
      category: extractCategory(validated.message),
      status: "new",
    },
  });

  return feedback;
}

export async function getFeedback(tenantId: string, feedbackId: string) {
  return prisma.feedback.findFirst({
    where: { id: feedbackId, tenantId },
  });
}

export async function getFeedbackByTenant(
  tenantId: string,
  status?: string,
  limit = 50
) {
  return prisma.feedback.findMany({
    where: {
      tenantId,
      ...(status && { status }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function updateFeedbackStatus(
  tenantId: string,
  feedbackId: string,
  status: string
) {
  const feedback = await getFeedback(tenantId, feedbackId);
  if (!feedback) throw new Error("Feedback not found");

  return prisma.feedback.update({
    where: { id: feedbackId },
    data: { status },
  });
}

export async function getFeedbackStats(tenantId: string) {
  const feedback = await prisma.feedback.findMany({
    where: { tenantId },
  });

  const byType = {
    bug: feedback.filter((f) => f.type === "bug").length,
    feature_request: feedback.filter((f) => f.type === "feature_request").length,
    general: feedback.filter((f) => f.type === "general").length,
  };

  const bySentiment = {
    positive: feedback.filter((f) => f.sentiment === "positive").length,
    neutral: feedback.filter((f) => f.sentiment === "neutral").length,
    negative: feedback.filter((f) => f.sentiment === "negative").length,
  };

  const byStatus = {
    new: feedback.filter((f) => f.status === "new").length,
    acknowledged: feedback.filter((f) => f.status === "acknowledged").length,
    resolved: feedback.filter((f) => f.status === "resolved").length,
    archived: feedback.filter((f) => f.status === "archived").length,
  };

  return { byType, bySentiment, byStatus };
}

export async function createFeedbackWidget(
  tenantId: string,
  data: {
    title: string;
    message: string;
    buttonText?: string;
    type?: "modal" | "sidebar" | "embedded";
    position?: string;
  }
) {
  return prisma.feedbackWidget.create({
    data: {
      tenantId,
      title: data.title,
      message: data.message,
      buttonText: data.buttonText || "Send Feedback",
      type: data.type || "modal",
      position: data.position || "bottom_right",
    },
  });
}

export async function getFeedbackWidget(tenantId: string) {
  return prisma.feedbackWidget.findFirst({
    where: { tenantId, enabled: true },
  });
}
