import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { generateTestPayload } from "@/lib/webhooks/tools";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { url, eventType = "user.created", secret } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    const payload = generateTestPayload(eventType);
    const timestamp = Math.floor(Date.now() / 1000);

    // Create signature
    const signature = secret
      ? crypto
          .createHmac("sha256", secret)
          .update(JSON.stringify(payload))
          .digest("hex")
      : "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ZekerFlex-Webhook-Test/1.0",
      "X-Webhook-Timestamp": timestamp.toString(),
    };

    if (signature) {
      headers["X-Webhook-Signature"] = `sha256=${signature}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        timeout: 10000,
      });

      const responseBody = await response.text();

      return NextResponse.json({
        success: response.ok,
        statusCode: response.status,
        statusText: response.statusText,
        responseBody: responseBody.slice(0, 1000), // First 1000 chars
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Connection failed",
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
