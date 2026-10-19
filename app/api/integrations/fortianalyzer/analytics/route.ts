import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { prisma } from '@/lib/prisma';
import { readFortiAnalyzerProfile } from '@/lib/integrations/fortianalyzer-source';
import { initSharedFortiAnalyzerService } from '@/lib/integrations/fortianalyzer';
import { SourceQueryError, withSourceDeadline } from '@/lib/integrations/source-query-error';
import { analyticsViews, analyticsWindow, normalizeAnalyticsRows, type AnalyticsView } from '@/lib/security/web-analytics';
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'settings', 'read'); if (!access.allowed) return access.response;
  const query = request.nextUrl.searchParams, configId = query.get('configId'), view = query.get('view'), minutes = Number(query.get('minutes')), expected = query.get('profileUpdatedAt');
  let window: { start: string; end: string };
  try { window = analyticsWindow(minutes, query.get('end') || ''); if (!configId || !analyticsViews.includes(view as AnalyticsView) || !expected || Date.parse(window.end) > Date.now() + 60_000 || Date.parse(window.end) < Date.now() - 7 * 86400_000) throw Error(); }
  catch { return reply({ success: false, code: 'INVALID_QUERY' }, 400); }
  try {
    const profile = await prisma.integrationConfig.findUnique({ where: { id: configId } });
    if (!profile || profile.type !== 'FORTIANALYZER') return reply({ success: false, code: 'PROFILE_NOT_FOUND' }, 404);
    if (!profile.enabled) return reply({ success: false, code: 'PROFILE_DISABLED' }, 409);
    if (profile.updatedAt.toISOString() !== expected) return reply({ success: false, code: 'PROFILE_CHANGED' }, 409);
    const config = readFortiAnalyzerProfile(profile.config), service = initSharedFortiAnalyzerService(config);
    const result = await withSourceDeadline(signal => service.getFortiView(view!, 100, { field: 'bandwidth', order: 'desc' }, undefined, minutes, { window, signal }), 75_000, request.signal);
    if (!result) return reply({ success: false, code: 'SOURCE_FAILED' }, 503);
    normalizeAnalyticsRows(result.data, view as AnalyticsView);
    const totalCount = result.totalCount === undefined ? null : result.totalCount;
    if (totalCount !== null && (!Number.isSafeInteger(totalCount) || totalCount < result.data.length)) return reply({ success: false, code: 'SOURCE_FAILED' }, 503);
    return reply({ success: true, view, scope: { configId, adom: config.adom, profileUpdatedAt: expected, minutes, ...window }, collectedAt: new Date().toISOString(), data: result.data, totalCount });
  } catch (error) { return reply({ success: false, code: error instanceof SourceQueryError && ['SOURCE_INVALID_CONFIG', 'SOURCE_TIMEOUT'].includes(error.code) ? error.code : 'SOURCE_FAILED' }, 503); }
}
