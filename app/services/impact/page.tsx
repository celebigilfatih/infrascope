'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight, RefreshCw, Search, Zap, Activity, AlertTriangle, Shield } from 'lucide-react';

interface ServiceImpact {
  id: string;
  service: string;
  impact: 'high' | 'medium' | 'low';
  affectedUsers: number;
  revenueLoss: number;
  recoveryTime: string;
  probability: number;
  lastIncident: string;
  mitigations: number;
}

const ITEMS_PER_PAGE = 10;

export default function ImpactPage() {
  const [impacts, setImpacts] = useState<ServiceImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setImpacts([
        { id: '1', service: 'API Gateway', impact: 'high', affectedUsers: 15000, revenueLoss: 45000, recoveryTime: '15 min', probability: 0.15, lastIncident: '2024-01-10', mitigations: 3 },
        { id: '2', service: 'Auth Service', impact: 'high', affectedUsers: 12000, revenueLoss: 38000, recoveryTime: '10 min', probability: 0.12, lastIncident: '2024-01-05', mitigations: 2 },
        { id: '3', service: 'Payment Service', impact: 'high', affectedUsers: 8000, revenueLoss: 65000, recoveryTime: '20 min', probability: 0.08, lastIncident: '2024-01-08', mitigations: 4 },
        { id: '4', service: 'User Database', impact: 'medium', affectedUsers: 5000, revenueLoss: 15000, recoveryTime: '30 min', probability: 0.05, lastIncident: '2024-01-12', mitigations: 2 },
        { id: '5', service: 'Search Engine', impact: 'medium', affectedUsers: 3000, revenueLoss: 8000, recoveryTime: '15 min', probability: 0.10, lastIncident: '2024-01-11', mitigations: 1 },
        { id: '6', service: 'Notification Service', impact: 'low', affectedUsers: 1000, revenueLoss: 2000, recoveryTime: '5 min', probability: 0.20, lastIncident: '2024-01-14', mitigations: 1 },
        { id: '7', service: 'Analytics Engine', impact: 'medium', affectedUsers: 2000, revenueLoss: 5000, recoveryTime: '45 min', probability: 0.03, lastIncident: '2024-01-02', mitigations: 2 },
        { id: '8', service: 'File Storage', impact: 'low', affectedUsers: 500, revenueLoss: 1000, recoveryTime: '10 min', probability: 0.25, lastIncident: '2024-01-13', mitigations: 1 },
        { id: '9', service: 'ML Pipeline', impact: 'low', affectedUsers: 200, revenueLoss: 500, recoveryTime: '60 min', probability: 0.02, lastIncident: '2023-12-28', mitigations: 3 },
        { id: '10', service: 'Cache Redis', impact: 'medium', affectedUsers: 4000, revenueLoss: 12000, recoveryTime: '2 min', probability: 0.30, lastIncident: '2024-01-15', mitigations: 2 },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredImpacts = useMemo(() => {
    if (!searchTerm) return impacts;
    const term = searchTerm.toLowerCase();
    return impacts.filter(imp => imp.service.toLowerCase().includes(term));
  }, [impacts, searchTerm]);

  const totalPages = Math.ceil(filteredImpacts.length / ITEMS_PER_PAGE);
  const paginatedImpacts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredImpacts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredImpacts, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge className="bg-orange-500">Medium</Badge>;
      case 'low': return <Badge className="bg-green-500">Low</Badge>;
      default: return <Badge variant="secondary">{impact}</Badge>;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-orange-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getProbabilityColor = (prob: number) => {
    if (prob < 0.10) return 'text-green-500';
    if (prob < 0.20) return 'text-orange-500';
    return 'text-red-500';
  };

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  const totalAffected = impacts.reduce((acc, imp) => acc + imp.affectedUsers, 0);
  const totalRevenue = impacts.reduce((acc, imp) => acc + imp.revenueLoss, 0);
  const highImpactCount = impacts.filter(i => i.impact === 'high').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Impact Analysis</h1>
          <p className="text-muted-foreground">Servis etki analizi ve risk değerlendirmesi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><Zap className="h-4 w-4 mr-2" />Yenile</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-red-500/20"><AlertTriangle className="h-6 w-6 text-red-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Yüksek Riskli Servis</p>
                <p className="text-3xl font-bold">{highImpactCount}</p>
              </div>
              <div className="flex-1 px-4">
                <Progress value={(highImpactCount / impacts.length) * 100} className="h-3" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20"><Activity className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-sm text-muted-foreground">Etkilenen Kullanıcı</p><p className="text-2xl font-bold">{totalAffected.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20"><Shield className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-sm text-muted-foreground">Potansiyel Kayıp</p><p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Servis ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Service Impact Analysis<Badge variant="secondary">{filteredImpacts.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servis</TableHead>
                    <TableHead className="text-center">Etki</TableHead>
                    <TableHead className="text-center">Etkilenen</TableHead>
                    <TableHead className="text-center">Gelir Kaybı</TableHead>
                    <TableHead className="text-center">Kurtarma Süresi</TableHead>
                    <TableHead className="text-center">Olasılık</TableHead>
                    <TableHead className="text-center">Mitigation</TableHead>
                    <TableHead>Son Olay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedImpacts.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sonuç bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedImpacts.map((impact) => (
                      <TableRow key={impact.id}>
                        <TableCell className="font-medium">{impact.service}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${getImpactColor(impact.impact)}`}></span>
                            {getImpactBadge(impact.impact)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono">{impact.affectedUsers.toLocaleString()}</TableCell>
                        <TableCell className="text-center font-mono text-red-500">${impact.revenueLoss.toLocaleString()}</TableCell>
                        <TableCell className="text-center font-mono">{impact.recoveryTime}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full ${getProbabilityColor(impact.probability).replace('text-', 'bg-')}`} style={{ width: `${impact.probability * 100}%` }}></div></div>
                            <span className={`text-sm font-mono ${getProbabilityColor(impact.probability)}`}>{(impact.probability * 100).toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center"><Badge variant="outline">{impact.mitigations} actions</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{impact.lastIncident}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Sayfa {currentPage} / {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    {getPageNumbers().map((page, idx) => (
                      <React.Fragment key={idx}>
                        {page === 'ellipsis' ? <span className="px-2 text-muted-foreground">...</span> : (
                          <Button variant={currentPage === page ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(page)} className="w-9">{page}</Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
