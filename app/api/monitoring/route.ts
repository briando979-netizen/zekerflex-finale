import { NextRequest, NextResponse } from 'next/server';
import {
  generateSLAReport,
  generatePerformanceReport,
  generateIncidentReport,
  calculateCapacityNeeds,
  identifyAnomalies,
  exportAnalysisReport,
} from '@/lib/monitoring/analysis';
import { getMetrics } from '@/lib/monitoring/metrics';
import { getLogs } from '@/lib/logging/aggregation';
import { getActiveAlerts } from '@/lib/alerts/manager';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'overview';
  const format = (searchParams.get('format') as 'json' | 'csv') || 'json';

  try {
    switch (type) {
      case 'sla':
        return NextResponse.json(generateSLAReport());

      case 'performance':
        return NextResponse.json(generatePerformanceReport());

      case 'incident':
        return NextResponse.json(generateIncidentReport());

      case 'capacity':
        return NextResponse.json(calculateCapacityNeeds());

      case 'anomalies':
        return NextResponse.json({ anomalies: identifyAnomalies() });

      case 'export':
        return new NextResponse(exportAnalysisReport(format), {
          headers: {
            'Content-Type': format === 'csv' ? 'text/csv' : 'application/json',
            'Content-Disposition': `attachment; filename="monitoring.${format}"`,
          },
        });

      case 'overview':
      default:
        return NextResponse.json({
          metrics: getMetrics().length,
          logs: getLogs().length,
          activeAlerts: getActiveAlerts().length,
          sla: generateSLAReport(),
          performance: generatePerformanceReport(),
          incident: generateIncidentReport(),
        });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
