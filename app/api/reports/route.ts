import { NextRequest, NextResponse } from 'next/server';
import { ReportsService } from '@/lib/reports';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const reportType = searchParams.get('type') || 'summary';

  const service = new ReportsService();

  try {
    let data: any;

    switch (reportType) {
      case 'inventory':
        data = await service.getInventoryReport();
        break;
      case 'capacity':
        data = await service.getCapacityReport();
        break;
      case 'vmware':
        data = await service.getVmwareReport();
        break;
      case 'integration':
        data = await service.getIntegrationReport();
        break;
      case 'alerts':
        data = await service.getAlertReport();
        break;
      case 'summary':
        data = await service.getDashboardSummary();
        break;
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Reports API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
