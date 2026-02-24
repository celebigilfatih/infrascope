import { NextResponse } from 'next/server';
import { analyzePolicyRisks } from '@/lib/security/riskAnalyzer';

export async function GET() {
  try {
    // Fetch firewall policies from our existing API
    const response = await fetch('http://localhost:3000/api/firewall-policies');
    
    if (!response.ok) {
      console.error('Failed to fetch firewall policies');
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch firewall policies',
        data: [],
        count: 0
      });
    }
    
    const policiesData = await response.json();
    
    if (!policiesData.success || !policiesData.data) {
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
        message: 'No firewall policies found'
      });
    }
    
    // Analyze policies for risks
    const detectedRisks = analyzePolicyRisks(policiesData.data);
    
    // Sort by severity (critical first)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    detectedRisks.sort((a, b) => 
      severityOrder[a.severity as keyof typeof severityOrder] - 
      severityOrder[b.severity as keyof typeof severityOrder]
    );
    
    // Cache the results (5 minutes)
    const globalCache = globalThis as any;
    if (!globalCache.riskyRulesCache) {
      globalCache.riskyRulesCache = {};
    }
    globalCache.riskyRulesCache.data = detectedRisks;
    globalCache.riskyRulesCache.timestamp = Date.now();
    
    return NextResponse.json({
      success: true,
      data: detectedRisks,
      count: detectedRisks.length,
      stats: {
        critical: detectedRisks.filter(r => r.severity === 'critical').length,
        high: detectedRisks.filter(r => r.severity === 'high').length,
        medium: detectedRisks.filter(r => r.severity === 'medium').length,
        low: detectedRisks.filter(r => r.severity === 'low').length,
        totalPolicies: policiesData.count
      }
    });
  } catch (error) {
    console.error('Error analyzing risky rules:', error);
    return NextResponse.json(
      { 
        success: false,
        error: (error as Error).message,
        data: [],
        count: 0
      },
      { status: 500 }
    );
  }
}
