import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// Import engagement modules
import * as surveys from "@/lib/engagement/surveys";
import * as recognition from "@/lib/engagement/recognition";
import * as analytics from "@/lib/engagement/analytics";
import * as development from "@/lib/engagement/development";
import * as wellness from "@/lib/engagement/wellness";
import * as feedback from "@/lib/engagement/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  action: z.enum([
    "create-pulse-survey",
    "submit-survey",
    "get-survey-results",
    "create-recognition",
    "get-recognition-wall",
    "get-leaderboard",
    "compute-engagement",
    "predict-attrition",
    "get-engagement-analytics",
    "create-learning-path",
    "enroll-course",
    "get-learning-progress",
    "create-mentorship",
    "get-mentorship",
    "get-succession-plans",
    "record-wellness",
    "get-wellness-summary",
    "get-wellness-programs",
    "create-wellness-challenge",
    "create-feedback",
    "create-goal",
    "get-goals",
    "generate-insights",
    "get-performance-report",
  ]),
  tenantId: z.string(),
  employeeId: z.string().optional(),
});

/**
 * POST /api/engagement
 * Unified engagement system API
 */
export async function POST(request: Request) {
  try {
    const principal = await requirePrincipal();
    const json = await request.json().catch(() => ({}));

    // Validate query
    const queryData = querySchema.safeParse(json);
    if (!queryData.success) {
      return NextResponse.json(
        { error: "Invalid request", details: queryData.error },
        { status: 400 }
      );
    }

    const { action, tenantId, employeeId } = queryData.data;
    const userId = principal.userId;

    // Authorization - tenant admin or HQ_ADMIN
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        role: { in: ["HQ_ADMIN", "PLATFORM_ADMIN"] },
      },
    });

    if (!membership && principal.role !== "PLATFORM_ADMIN") {
      throw AppError.forbidden("Unauthorized for this tenant");
    }

    // Route handlers
    switch (action) {
      case "create-pulse-survey": {
        const input = surveys.createPulseSurveySchema.parse(json);
        const questions = z
          .array(
            z.object({
              text: z.string(),
              type: z.string(),
              required: z.boolean().optional(),
              order: z.number(),
            })
          )
          .parse(json.questions);

        const result = await surveys.createPulseSurvey(tenantId, input, questions);
        return NextResponse.json(result);
      }

      case "submit-survey": {
        const surveyId = z.string().parse(json.surveyId);
        const input = surveys.answerPulseSurveySchema.parse(json);
        const result = await surveys.submitPulseSurveyResponse(surveyId, input);
        return NextResponse.json(result);
      }

      case "get-survey-results": {
        const surveyId = z.string().parse(json.surveyId);
        const results = await surveys.getSurveyResults(surveyId);
        return NextResponse.json(results);
      }

      case "create-recognition": {
        const recipientId = z.string().parse(json.recipientId);
        const input = recognition.createRecognitionSchema.parse(json);
        const result = await recognition.createRecognition(tenantId, userId, input);
        return NextResponse.json(result);
      }

      case "get-recognition-wall": {
        const limit = z.number().optional().parse(json.limit ?? 50);
        const wall = await recognition.getRecognitionWall(tenantId, limit);
        return NextResponse.json(wall);
      }

      case "get-leaderboard": {
        const limit = z.number().optional().parse(json.limit ?? 10);
        const leaderboard = await recognition.getLeaderboard(tenantId, limit);
        return NextResponse.json(leaderboard);
      }

      case "compute-engagement": {
        const targetEmployeeId = json.employeeId || employeeId;
        const engagementScore = await analytics.computeEngagementScore(
          tenantId,
          targetEmployeeId
        );
        return NextResponse.json(engagementScore);
      }

      case "predict-attrition": {
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const riskAssessment = await analytics.predictAttritionRisk(tenantId, employeeId);
        return NextResponse.json(riskAssessment);
      }

      case "get-engagement-analytics": {
        const companyAnalytics = await analytics.getCompanyEngagementAnalytics(tenantId);
        return NextResponse.json(companyAnalytics);
      }

      case "create-learning-path": {
        const input = development.createLearningPathSchema.parse(json);
        const courses = z.array(z.any()).parse(json.courses ?? []);
        const path = await development.createLearningPath(tenantId, input, courses);
        return NextResponse.json(path);
      }

      case "enroll-course": {
        const pathId = z.string().parse(json.pathId);
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const enrollment = await development.enrollInLearningPath(pathId, employeeId);
        return NextResponse.json(enrollment);
      }

      case "get-learning-progress": {
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const progress = await development.getEmployeeLearningProgress(employeeId);
        return NextResponse.json(progress);
      }

      case "create-mentorship": {
        const input = development.createMentorshipSchema.parse(json);
        const match = await development.createMentorshipMatch(tenantId, input);
        return NextResponse.json(match);
      }

      case "get-mentorship": {
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const matches = await development.getMentorshipMatches(employeeId);
        return NextResponse.json(matches);
      }

      case "get-succession-plans": {
        const plans = await development.getSuccessionPlans(tenantId);
        return NextResponse.json(plans);
      }

      case "record-wellness": {
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const input = wellness.recordWellnessActivitySchema.parse(json);
        const activity = await wellness.recordWellnessActivity(tenantId, employeeId, input);
        return NextResponse.json(activity);
      }

      case "get-wellness-summary": {
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const summary = await wellness.getEmployeeWellnessSummary(employeeId);
        return NextResponse.json(summary);
      }

      case "get-wellness-programs": {
        const programs = await wellness.getWellnessPrograms(tenantId);
        return NextResponse.json(programs);
      }

      case "create-wellness-challenge": {
        const input = wellness.createWellnessChallengeSchema.parse(json);
        const challenge = await wellness.createWellnessChallenge(tenantId, input);
        return NextResponse.json(challenge);
      }

      case "create-feedback": {
        const input = feedback.createFeedbackSessionSchema.parse(json);
        const session = await feedback.createFeedbackSession(tenantId, userId, input);
        return NextResponse.json(session);
      }

      case "create-goal": {
        const input = feedback.createGoalProgressSchema.parse(json);
        const goal = await feedback.createEmployeeGoal(tenantId, input);
        return NextResponse.json(goal);
      }

      case "get-goals": {
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const goals = await feedback.getEmployeeGoals(employeeId);
        return NextResponse.json(goals);
      }

      case "generate-insights": {
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const insights = await feedback.generatePerformanceInsights(employeeId, tenantId);
        return NextResponse.json(insights);
      }

      case "get-performance-report": {
        if (!employeeId) throw AppError.badRequest("employeeId required");
        const report = await feedback.generateFeedbackReport(employeeId);
        return NextResponse.json(report);
      }

      default:
        throw AppError.badRequest(`Unknown action: ${action}`);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
