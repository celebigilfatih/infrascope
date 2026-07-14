import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import FortiAnalyzerService, { initSharedFortiAnalyzerService } from '@/lib/integrations/fortianalyzer';
import { prisma } from '@/lib/prisma';
import { unprotectIntegrationConfig } from '@/lib/security/integration-credentials';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const domain = searchParams.get('domain') || 'enterprise';
    const techId = searchParams.get('techId');
    const adom = searchParams.get('adom') || 'root';
    
    // Parse time range if provided
    let timeRange = undefined;
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    if (startTime && endTime) {
      timeRange = { start: startTime, end: endTime };
    }

    // Get FortiAnalyzer configuration from database (same as main route)
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIANALYZER', enabled: true },
    });

    if (!config) {
      return NextResponse.json({
        success: false,
        error: 'FortiAnalyzer integration not configured',
      });
    }

    const faConfig = unprotectIntegrationConfig<{
      host: string;
      username?: string;
      password?: string;
    }>(config.config, 'FORTIANALYZER');

    if (!faConfig.password) {
      return NextResponse.json({
        success: false,
        error: 'FortiAnalyzer password not configured',
      }, { status: 400 });
    }

    const service = initSharedFortiAnalyzerService({
      host: faConfig.host,
      username: faConfig.username,
      password: faConfig.password,
    });

    // Login first
    const loggedIn = await service.login();
    if (!loggedIn) {
      return NextResponse.json({
        success: false,
        error: 'Failed to login to FortiAnalyzer',
      });
    }

    let result;

    switch (type) {
      case 'matrix':
        result = await service.getMitreAttackMatrix({ domain, timeRange, adom });
        return NextResponse.json({ success: true, data: result, type: 'matrix' });
      
      case 'technique':
        if (!techId) {
          return NextResponse.json({ success: false, error: 'techId parameter is required for technique details' }, { status: 400 });
        }
        result = await service.getMitreTechniqueDetails(techId, { domain, timeRange, adom });
        return NextResponse.json({ success: true, data: result, type: 'technique', techId });
      
      default:
        return NextResponse.json({ success: false, error: 'Invalid type parameter. Use "matrix" or "technique".' }, { status: 400 });
    }
  } catch (error) {
    console.error('MITRE API error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }, { status: 500 });
  }
}
