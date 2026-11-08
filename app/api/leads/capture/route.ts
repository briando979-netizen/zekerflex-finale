import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { captureLead } from "@/lib/sales/lead-capture";
import { validateEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const LeadCaptureSchema = z.object({
  email: z.string().email("Ongeldig e-mailadres"),
  name: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  source: z.enum(["web_form", "landing_page", "import", "api"]),
  contactName: z.string().optional(),
  contactTitle: z.string().optional(),
  contactPhone: z.string().optional(),
  kvkNumber: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.enum(["1-10", "11-50", "51-200", "200+"]).optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const data = LeadCaptureSchema.parse(body);

    // Double-check email
    if (!validateEmail(data.email)) {
      return NextResponse.json(
        { error: "Ongeldig e-mailadres" },
        { status: 400 },
      );
    }

    // Get client IP for tracking
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Get user agent
    const userAgent = request.headers.get("user-agent") || undefined;

    // Get referrer
    const referrer = request.headers.get("referer") || undefined;

    // Capture the lead
    const result = await captureLead(
      {
        ...data,
        ipAddress,
        userAgent,
        referrer,
      },
      undefined, // No actor ID for API calls
    );

    logger.info("Lead captured via API", {
      email: data.email,
      source: data.source,
      isNew: result.isNew,
    });

    return NextResponse.json(
      {
        success: true,
        leadId: result.lead.id,
        isNew: result.isNew,
        message: result.isNew
          ? "Lead succesvol vastgelegd"
          : "Lead gegevens bijgewerkt",
      },
      { status: result.isNew ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validatiefout",
          details: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 },
      );
    }

    logger.error("Failed to capture lead", { error });

    return NextResponse.json(
      { error: "Fout bij vastleggen lead" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: "Gebruik POST om een lead vast te leggen" },
    { status: 405 },
  );
}
