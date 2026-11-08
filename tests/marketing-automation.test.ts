import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import * as emailCampaigns from "@/lib/marketing/email-campaigns";
import * as segmentation from "@/lib/marketing/segmentation";
import * as automationWorkflows from "@/lib/marketing/automation-workflows";
import * as abTesting from "@/lib/marketing/ab-testing";
import * as campaignAnalytics from "@/lib/marketing/campaign-analytics";
import * as integrations from "@/lib/marketing/integrations";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailCampaign: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailSubscriber: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    emailSegment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailAutomation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailABTest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailSend: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    emailTemplate: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    emailList: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    emailClickEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    emailConversionEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

describe("Marketing Automation - Email Campaigns", () => {
  const tenantId = "test-tenant-1";
  const templateId = "test-template-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maak email campagne aan", async () => {
    const campaignData = {
      name: "Test Campagne",
      description: "Een test campagne",
      templateId,
      listId: "list-1",
    };

    vi.mocked(prisma.emailTemplate.findUnique).mockResolvedValue({
      id: templateId,
      tenantId,
      name: "Test Template",
      type: "PROMOTIONAL",
      subject: "Test",
      htmlBody: "Test",
      textBody: null,
      variables: {},
      abtestVariantA: null,
      abtestVariantB: null,
      darkModeStyles: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.emailCampaign.create).mockResolvedValue({
      id: "campaign-1",
      tenantId,
      name: campaignData.name,
      templateId,
      listId: "list-1",
      segmentFilter: {},
      status: "DRAFT",
      scheduledAt: null,
      sentAt: null,
      recipientCount: 0,
      openCount: 0,
      clickCount: 0,
      bounceCount: 0,
      conversionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const campaign = await emailCampaigns.createCampaign(tenantId, campaignData);

    expect(campaign.id).toBe("campaign-1");
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.name).toBe("Test Campagne");
  });
});

describe("Marketing Automation - Segmentation", () => {
  const tenantId = "test-tenant-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maak segment aan", async () => {
    const segmentData = {
      name: "Actieve abonnees",
      rules: [
        {
          field: "status",
          operator: "equals" as const,
          value: "SUBSCRIBED",
        },
      ],
    };

    vi.mocked(prisma.emailSegment.create).mockResolvedValue({
      id: "segment-1",
      tenantId,
      name: segmentData.name,
      description: null,
      rules: segmentData.rules,
      combinationLogic: "AND",
      listId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const segment = await segmentation.createSegment(tenantId, segmentData);

    expect(segment.id).toBe("segment-1");
    expect(segment.name).toBe("Actieve abonnees");
  });

  it("filter abonnees op basis van regels", () => {
    const subscribers = [
      {
        id: "sub-1",
        email: "active@test.com",
        status: "SUBSCRIBED",
        engagementScore: 75,
      },
      {
        id: "sub-2",
        email: "inactive@test.com",
        status: "UNSUBSCRIBED",
        engagementScore: 10,
      },
    ];

    const rules = [
      {
        field: "status",
        operator: "equals" as const,
        value: "SUBSCRIBED",
      },
    ];

    const filtered = segmentation.filterSubscribersByRules(
      subscribers,
      rules,
      "AND"
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].email).toBe("active@test.com");
  });
});

describe("Marketing Automation - A/B Testing", () => {
  const tenantId = "test-tenant-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maak A/B test aan", async () => {
    const testData = {
      campaignId: "campaign-1",
      type: "subject_line" as const,
      variantA: { name: "Variant A", value: "Hallo!" },
      variantB: { name: "Variant B", value: "Goedendag!" },
      splitPercentage: 50,
    };

    vi.mocked(prisma.emailCampaign.findUnique).mockResolvedValue({
      id: "campaign-1",
      tenantId,
      name: "Test",
      templateId: "t1",
      listId: null,
      segmentFilter: null,
      status: "DRAFT",
      scheduledAt: null,
      sentAt: null,
      recipientCount: 0,
      openCount: 0,
      clickCount: 0,
      bounceCount: 0,
      conversionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.emailABTest.create).mockResolvedValue({
      id: "test-1",
      campaignId: "campaign-1",
      type: "subject_line",
      variantA: testData.variantA,
      variantB: testData.variantB,
      splitPercentage: 50,
      testDuration: null,
      successMetric: "open_rate",
      status: "CREATED",
      winner: null,
      variantAMetrics: null,
      variantBMetrics: null,
      startedAt: null,
      endedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const test = await abTesting.createABTest(tenantId, testData);

    expect(test.id).toBe("test-1");
    expect(test.status).toBe("CREATED");
    expect(test.type).toBe("subject_line");
  });
});

describe("Marketing Automation - Campaign Analytics", () => {
  it("bereken campagne metriek", async () => {
    const campaignId = "campaign-1";

    vi.mocked(prisma.emailCampaign.findUnique).mockResolvedValue({
      id: campaignId,
      tenantId: "tenant-1",
      name: "Test Campaign",
      templateId: "t1",
      listId: null,
      segmentFilter: null,
      status: "RUNNING",
      scheduledAt: null,
      sentAt: new Date(),
      recipientCount: 100,
      openCount: 45,
      clickCount: 12,
      bounceCount: 2,
      conversionCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      sends: [
        { id: "s1", opened: true, clicked: false, bounced: false, converted: false } as any,
        { id: "s2", opened: true, clicked: true, bounced: false, converted: true } as any,
        { id: "s3", opened: false, clicked: false, bounced: true, converted: false } as any,
      ],
    });

    const metrics = await campaignAnalytics.getCampaignMetrics(campaignId);

    expect(metrics.campaignId).toBe(campaignId);
    expect(metrics.totalSends).toBe(3);
    expect(metrics.opens).toBe(2);
    expect(metrics.conversions).toBe(1);
  });
});

describe("Marketing Automation - Integrations", () => {
  it("bereken lead score", async () => {
    const subscriberId = "sub-1";

    vi.mocked(prisma.emailSubscriber.findUnique).mockResolvedValue({
      id: subscriberId,
      tenantId: "tenant-1",
      listId: "list-1",
      email: "test@example.com",
      status: "SUBSCRIBED",
      firstName: "Test",
      lastName: "User",
      metadata: {},
      consentGiven: true,
      consentDate: new Date(),
      engagementScore: 65,
      lastEngagementAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      sends: [
        { opened: true, clicked: false, converted: false } as any,
        { opened: true, clicked: true, converted: false } as any,
        { opened: false, clicked: false, converted: true } as any,
      ],
    });

    const score = await integrations.calculateLeadScore(subscriberId);

    expect(score.subscriberId).toBe(subscriberId);
    expect(score.totalScore).toBeGreaterThan(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D", "F"]).toContain(score.grade);
  });
});
