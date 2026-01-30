'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertOctagon, Shield, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RiskAsset {
  id: string;
  name: string;
  type: string;
  riskScore: number;
  category: 'security' | 'compliance' | 'performance' | 'capacity';
  issues: string[];
  lastUpdated: string;
}

export default function RisksPage() {
  const [risks, setRisks] = useState<RiskAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setRisks([
        {
          id: '1',
          name: 'SRV-DB-01',
          type: 'Database Server',
          riskScore: 92,
          category: 'security',
          issues: ['Outdated OS patches', 'Default passwords detected', 'Open ports exposed'],
          lastUpdated: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'FW-EDGE-01',
          type: 'Firewall',
          riskScore: 78,
          category: 'compliance',
          issues: ['Outdated firmware', 'Expired SSL certificates'],
          lastUpdated: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: '3',
          name: 'STG-NAS-01',
          type: 'Storage',
          riskScore: 65,
          category: 'capacity',
          issues: ['Disk usage above 90%', 'RAID degradation warning'],
          lastUpdated: new Date(Date.now() - 172800000).toISOString(),
        },
        {
          id: '4',
          name: 'SW-CORE-01',
          type: 'Switch',
          riskScore: 45,
          category: 'performance',
          issues: ['High latency detected', 'Packet loss > 1%'],
          lastUpdated: new Date(Date.now() - 259200000).toISOString(),
        },
        {
          id: '5',
          name: 'SRV-WEB-02',
          type: 'Web Server',
          riskScore: 28,
          category: 'security',
          issues: ['Weak SSL configuration'],
          lastUpdated: new Date(Date.now() - 345600000).toISOString(),
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-red-500';
    if (score >= 60) return 'text-orange-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getRiskBadge = (score: number) => {
    if (score >= 80) return <Badge variant="destructive">Kritik</Badge>;
    if (score >= 60) return <Badge className="bg-orange-500">Yüksek</Badge>;
    if (score >= 40) return <Badge className="bg-yellow-500">Orta</Badge>;
    return <Badge variant="secondary">Düşük</Badge>;
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security': return <Shield className="h-4 w-4" />;
      case 'compliance': return <AlertTriangle className="h-4 w-4" />;
      case 'performance': return <TrendingUp className="h-4 w-4" />;
      case 'capacity': return <AlertOctagon className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const avgRiskScore = risks.length > 0
    ? Math.round(risks.reduce((acc, r) => acc + r.riskScore, 0) / risks.length)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Riskli Asset'ler</h1>
          <p className="text-muted-foreground">Güvenlik ve uyumluluk riskleri</p>
        </div>
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Risk Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className={cn("text-4xl font-bold", getRiskColor(avgRiskScore))}>
                {avgRiskScore}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Ortalama Risk Skoru</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <AlertOctagon className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kritik Risk</p>
                <p className="text-2xl font-bold text-red-500">
                  {risks.filter(r => r.riskScore >= 80).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Shield className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Güvenlik</p>
                <p className="text-2xl font-bold">
                  {risks.filter(r => r.category === 'security').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                {avgRiskScore < 50 ? (
                  <TrendingDown className="h-5 w-5 text-blue-500" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Trend</p>
                <p className="text-2xl font-bold">
                  {avgRiskScore < 50 ? 'İyileşiyor' : 'Kötüleşiyor'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk List */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Değerlendirmesi</CardTitle>
          <CardDescription>Yüksek riskli asset'ler ve tespit edilen sorunlar</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {risks
                .sort((a, b) => b.riskScore - a.riskScore)
                .map((risk) => (
                  <div
                    key={risk.id}
                    className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                  >
                    <div className="flex-shrink-0 w-16 text-center">
                      <div className={cn("text-2xl font-bold", getRiskColor(risk.riskScore))}>
                        {risk.riskScore}
                      </div>
                      <p className="text-xs text-muted-foreground">Risk Skoru</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {getRiskBadge(risk.riskScore)}
                        <Badge variant="outline" className="flex items-center gap-1">
                          {getCategoryIcon(risk.category)}
                          {risk.category.charAt(0).toUpperCase() + risk.category.slice(1)}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{risk.type}</span>
                      </div>
                      <h4 className="font-semibold text-lg">{risk.name}</h4>
                      <div className="mt-3 space-y-2">
                        {risk.issues.map((issue, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">
                        Güncellenme: {new Date(risk.lastUpdated).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
