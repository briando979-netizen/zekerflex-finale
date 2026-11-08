import { logger } from "@/lib/ops/logger";

interface SupportRequest {
  userId: string;
  message: string;
  context?: Record<string, any>;
}

interface SupportResponse {
  answer: string;
  category: string;
  confidence: number;
  escalate: boolean;
}

export async function handleSupportRequest(request: SupportRequest): Promise<SupportResponse> {
  try {
    const category = classifyQuestion(request.message);
    const answer = getAnswer(category, request.context);
    const confidence = calculateConfidence(category);

    return {
      answer,
      category,
      confidence,
      escalate: confidence < 0.6,
    };
  } catch (err) {
    logger.error("Support request handling failed", { request, err });
    return {
      answer: "I'll connect you with a support agent.",
      category: "escalation",
      confidence: 0,
      escalate: true,
    };
  }
}

function classifyQuestion(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("payment") || lower.includes("invoice")) return "billing";
  if (lower.includes("job") || lower.includes("shift")) return "jobs";
  if (lower.includes("account") || lower.includes("profile")) return "account";
  if (lower.includes("help") || lower.includes("how")) return "help";
  if (lower.includes("issue") || lower.includes("problem")) return "technical";

  return "general";
}

function getAnswer(category: string, context?: Record<string, any>): string {
  const answers: Record<string, string> = {
    billing: "For billing questions, visit your Account → Payments section or contact support@zekerflex.com",
    jobs: "Browse available jobs in your Dashboard. Apply to shifts that match your skills and availability.",
    account: "Manage your profile in Account settings. Update your information anytime.",
    help: "Visit our Help Center at zekerflex.com/help or chat with support.",
    technical: "Please describe the issue. Our team will investigate and get back to you shortly.",
    general: "How can we help? Be specific about your question.",
  };

  return answers[category] || answers.general;
}

function calculateConfidence(category: string): number {
  const confidences: Record<string, number> = {
    billing: 0.85,
    jobs: 0.9,
    account: 0.8,
    help: 0.7,
    technical: 0.5,
    general: 0.4,
  };

  return confidences[category] || 0.5;
}

export function prioritizeTicket(issue: string): "urgent" | "high" | "normal" | "low" {
  if (issue.includes("payment failed") || issue.includes("account blocked")) return "urgent";
  if (issue.includes("missing") || issue.includes("error")) return "high";
  if (issue.includes("question")) return "normal";
  return "low";
}

export async function suggestResponse(ticketId: string, issue: string): Promise<string> {
  const category = classifyQuestion(issue);
  return getAnswer(category);
}
