import { NextRequest, NextResponse } from "next/server";
import { detectRegion, detectLanguage } from "@/lib/i18n/global/detector";
import { getRegionalConfig } from "@/lib/regions/config";
import { getFormatter } from "@/lib/regions/formatting";
import { getAvailablePayments } from "@/lib/payments/regional";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const region = await detectRegion();
    const language = await detectLanguage();

    const config = getRegionalConfig(region);
    const formatter = getFormatter(region);
    const payments = getAvailablePayments(region);

    return NextResponse.json({
      region,
      language,
      config: {
        name: config.name,
        currency: config.currency,
        timezone: config.timezone,
        vat: config.vat,
        languages: config.languages,
        gdprEnabled: config.gdprEnabled,
        ccpaEnabled: config.ccpaEnabled,
      },
      payments: payments.map(p => ({
        method: p.method,
        name: p.name,
        icon: p.icon,
        fee: p.fee,
        settlement: p.settlement,
      })),
      sampleFormatting: {
        currency: formatter.formatCurrency(99.99),
        date: formatter.formatDate(new Date()),
        time: formatter.formatTime(new Date()),
        phone: formatter.formatPhone("+11234567890"),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to get regional config" }, { status: 500 });
  }
}
