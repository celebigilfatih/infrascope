'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  AlertTriangle, 
  Search, 
  Clock, 
  TrendingUp, 
  Activity,
  Filter,
  Calendar,
  Download,
  Info,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// Interfaces for MITRE ATT&CK data
interface MitreTechnique {
  techid: string;
  name: string;
  url: string;
  eventCount: number;
  incidentCount: number;
  handlerCount: {
    total: number;
    enabled: number;
    triggered: number;
  };
}

interface MitreTactic {
  id: string;
  name: string;
  url: string;
  displayOrder: number;
  handlerCount: {
    total: number;
    enabled: number;
    triggered: number;
  };
  eventCount: number;
  incidentCount: number;
  techniques: MitreTechnique[];
}

interface MitreMatrixData {
  handlerCoverage: {
    totalHandlers: number;
    totalHandlersEnabled: number;
    totalTechniques: number;
    totalTechniquesCovered: number;
    coverageRate: number;
  };
  tactics: MitreTactic[];
}

const TIME_RANGES = [
  { label: 'Son 24 Saat', value: '24h' },
  { label: 'Son 7 Gün', value: '7d' },
  { label: 'Son 30 Gün', value: '30d' },
  { label: 'Son 90 Gün', value: '90d' },
];

const DEFAULT_TIME_RANGE = '30d';

export default function MitreAttackPage() {
  const [matrixData, setMatrixData] = useState<MitreMatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTactic, setSelectedTactic] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [timeRange, setTimeRange] = useState(DEFAULT_TIME_RANGE);
  const [selectedDomain, setSelectedDomain] = useState('enterprise');
  const [selectedTechnique, setSelectedTechnique] = useState<MitreTechnique | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Fetch MITRE ATT&CK data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(
          `/api/integrations/fortianalyzer/mitre?type=matrix&domain=${selectedDomain}&startTime=${getTimeRangeStart(timeRange)}&endTime=${getTimeRangeEnd()}`
        );
        
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'MITRE verisi alınamadı');
        }
        
        // Process the data to match our interface
        const processedData = processMatrixData(result.data);
        setMatrixData(processedData);
      } catch (err) {
        console.error('MITRE data fetch error:', err);
        setError(err instanceof Error ? err.message : 'Bilinmeyen hata oluştu');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedDomain, timeRange]);

  const getTimeRangeStart = (range: string): string => {
    const now = new Date();
    switch (range) {
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      default: return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const getTimeRangeEnd = (): string => {
    return new Date().toISOString();
  };

  const processMatrixData = (rawData: any): MitreMatrixData => {
    if (!rawData) {
      console.error('No MITRE data received');
      return {
        handlerCoverage: { totalHandlers: 0, totalHandlersEnabled: 0, totalTechniques: 0, totalTechniquesCovered: 0, coverageRate: 0 },
        tactics: [],
      };
    }
    
    // rawData is { jsonrpc, result: { tactics: [...], handler-coverage: {...} }, id }
    const result = rawData.result || rawData;
    
    const handlerCoverage = result['handler-coverage'] || {};
    const tacticsRaw = result.tactics || [];
    
    const tactics: MitreTactic[] = tacticsRaw.map((tactic: any) => ({
      id: tactic.id || '',
      name: tactic.name || 'Unknown Tactic',
      url: tactic.url || '',
      displayOrder: tactic.display_order || 0,
      handlerCount: {
        total: tactic['handler-count']?.total || 0,
        enabled: tactic['handler-count']?.enabled || 0,
        triggered: tactic['handler-count']?.triggered || 0,
      },
      eventCount: tactic['event-count'] || 0,
      incidentCount: tactic['incident-count'] || 0,
      techniques: (tactic.techniques || []).map((tech: any) => ({
        techid: tech.techid || '',
        name: tech.name || 'Unknown Technique',
        url: tech.url || '',
        eventCount: tech['event-count'] || 0,
        incidentCount: tech['incident-count'] || 0,
        handlerCount: {
          total: tech['handler-count']?.total || 0,
          enabled: tech['handler-count']?.enabled || 0,
          triggered: tech['handler-count']?.triggered || 0,
        }
      }))
    }));
    
    return {
      handlerCoverage: {
        totalHandlers: handlerCoverage['total-handlers'] || 0,
        totalHandlersEnabled: handlerCoverage['total-handlers-enabled'] || 0,
        totalTechniques: handlerCoverage['total-techniques'] || 0,
        totalTechniquesCovered: handlerCoverage['total-techniques-covered'] || 0,
        coverageRate: Math.round(handlerCoverage['coverage-rate'] || 0),
      },
      tactics
    };
  };

  const filteredTactics = matrixData?.tactics.filter((tactic: MitreTactic) => {
    if (selectedTactic !== 'all' && !tactic.id.includes(selectedTactic)) {
      return false;
    }
    
    if (searchTerm) {
      return tactic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             tactic.techniques.some((tech: MitreTechnique) => 
               tech.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
               tech.techid.toLowerCase().includes(searchTerm.toLowerCase())
             );
    }
    
    return true;
  }) || [];

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const handleTechniqueClick = (technique: MitreTechnique) => {
    setSelectedTechnique(technique);
    setIsDetailModalOpen(true);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">MITRE ATT&CK Matrix</h1>
            <p className="text-muted-foreground">FortiAnalyzer MITRE ATT&CK Matrix verileri</p>
          </div>
        </div>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">MITRE ATT&CK Matrix</h1>
            <p className="text-muted-foreground">FortiAnalyzer MITRE ATT&CK Matrix verileri</p>
          </div>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Veri Alınamadı</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Yeniden Dene</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">MITRE ATT&CK Matrix</h1>
          <p className="text-muted-foreground">FortiAnalyzer MITRE ATT&CK Matrix verileri</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enterprise">Enterprise</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="ics">ICS</SelectItem>
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(range => (
                <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Coverage Summary Cards */}
      {matrixData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                Toplam Handler
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(matrixData.handlerCoverage.totalHandlers)}</div>
              <div className="text-xs text-muted-foreground">Koruma seviyesi</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                Etkin Handler
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(matrixData.handlerCoverage.totalHandlersEnabled)}</div>
              <div className="text-xs text-muted-foreground">İzlemede olan</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                Kapsanan Teknikler
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(matrixData.handlerCoverage.totalTechniquesCovered)}</div>
              <div className="text-xs text-muted-foreground">/{formatNumber(matrixData.handlerCoverage.totalTechniques)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Filter className="h-4 w-4 text-purple-500" />
                Kapsama Oranı
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{matrixData.handlerCoverage.coverageRate}%</div>
              <Progress value={matrixData.handlerCoverage.coverageRate} className="mt-2" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Taktik veya teknik ara..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedTactic} onValueChange={setSelectedTactic}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Taktik Seçin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Taktikler</SelectItem>
            {matrixData?.tactics.map(tactic => (
              <SelectItem key={tactic.id} value={tactic.id}>
                {tactic.name} ({tactic.id})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tactics and Techniques */}
      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matrix">Matrix Görünümü</TabsTrigger>
          <TabsTrigger value="list">Detaylı Liste</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Taktiklere Göre Dağılım
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredTactics.map(tactic => (
                  <Card key={tactic.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{tactic.name}</h3>
                          <p className="text-sm text-muted-foreground">{tactic.id}</p>
                        </div>
                        <Badge variant="outline">{tactic.techniques.length} teknik</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Olay: {formatNumber(tactic.eventCount)}</span>
                          <span>Incident: {formatNumber(tactic.incidentCount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Toplam Handler: {tactic.handlerCount.total}</span>
                          <span>Etkin: {tactic.handlerCount.enabled}</span>
                        </div>
                        {tactic.handlerCount.triggered > 0 && (
                          <div className="flex justify-between text-sm text-red-600">
                            <span>Tetiklenen: {tactic.handlerCount.triggered}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Tüm Teknikler
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">ID</TableHead>
                      <TableHead>Teknik</TableHead>
                      <TableHead className="text-right">Olay Sayısı</TableHead>
                      <TableHead className="text-right">Incident Sayısı</TableHead>
                      <TableHead className="text-right">Toplam Handler</TableHead>
                      <TableHead className="text-right">Etkin Handler</TableHead>
                      <TableHead className="text-right">Tetiklenen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTactics.flatMap((tactic: MitreTactic) => 
                      tactic.techniques
                        .filter((tech: MitreTechnique) => 
                          !searchTerm || 
                          tech.techid.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tech.name.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map((tech: MitreTechnique) => (
                        <TableRow key={`${tactic.id}-${tech.techid}`}>
                          <TableCell className="font-mono text-sm whitespace-nowrap">{tech.techid}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{tech.name}</div>
                              <div className="text-xs text-muted-foreground">{tactic.name}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatNumber(tech.eventCount)}</TableCell>
                          <TableCell className="text-right font-mono">{formatNumber(tech.incidentCount)}</TableCell>
                          <TableCell className="text-right font-mono">{tech.handlerCount.total}</TableCell>
                          <TableCell className="text-right font-mono">{tech.handlerCount.enabled}</TableCell>
                          <TableCell className="text-right font-mono">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleTechniqueClick(tech)}
                              className="h-auto p-1"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Technique Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTechnique?.name} ({selectedTechnique?.techid})</DialogTitle>
            <DialogDescription>
              MITRE ATT&CK Teknik Detayları
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Olaylar</h4>
                <p className="text-2xl font-bold text-blue-600">{formatNumber(selectedTechnique?.eventCount || 0)}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Incidents</h4>
                <p className="text-2xl font-bold text-red-600">{formatNumber(selectedTechnique?.incidentCount || 0)}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Toplam Handler</h4>
                <p className="text-xl font-semibold">{selectedTechnique?.handlerCount.total || 0}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Etkin Handler</h4>
                <p className="text-xl font-semibold">{selectedTechnique?.handlerCount.enabled || 0}</p>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Tanım</h4>
              <p className="text-sm text-muted-foreground">
                {selectedTechnique?.name} tekniği, saldırganların sistemlere erişim sağlaması için kullanılan MITRE ATT&CK sınıflandırmasına göre bir tekniktir.
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => window.open(selectedTechnique?.url, '_blank')}
              >
                MITRE Kaynağı <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}