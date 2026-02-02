'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight, RefreshCw, Search, AlertTriangle, Activity, TrendingUp } from 'lucide-react';

interface Risk {
  id: string;
  title: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  likelihood: 'high' | 'medium' | 'low';
  status: 'open' | 'mitigated' | 'accepted' | 'closed';
  affectedAssets: number;
  owner: string;
  createdAt: string;
}

const ITEMS_PER_PAGE = 10;

export default function RisksPage() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setRisks([
        { id: '1', title: 'Ransomware Attack', category: 'Malware', severity: 'critical', likelihood: 'medium', status: 'open', affectedAssets: 45, owner: 'Sec Team', createdAt: '2024-01-10' },
        { id: '2', title: 'Data Breach', category: 'Data Protection', severity: 'critical', likelihood: 'low', status: 'mitigated', affectedAssets: 12, owner: 'DPO', createdAt: '2024-01-08' },
        { id: '3', title: 'Phishing Campaign', category: 'Social Engineering', severity: 'high', likelihood: 'high', status: 'open', affectedAssets: 234, owner: 'Sec Team', createdAt: '2024-01-12' },
        { id: '4', title: 'DDoS Attack', category: 'Network', severity: 'high', likelihood: 'medium', status: 'mitigated', affectedAssets: 8, owner: 'Net Team', createdAt: '2024-01-05' },
        { id: '5', title: 'Insider Threat', category: 'Human', severity: 'high', likelihood: 'low', status: 'accepted', affectedAssets: 3, owner: 'HR', createdAt: '2024-01-03' },
        { id: '6', title: 'Unpatched Vulnerability', category: 'Vulnerability', severity: 'medium', likelihood: 'medium', status: 'open', affectedAssets: 15, owner: 'IT Ops', createdAt: '2024-01-14' },
        { id: '7', title: 'SQL Injection', category: 'Application', severity: 'high', likelihood: 'medium', status: 'mitigated', affectedAssets: 6, owner: 'Dev Team', createdAt: '2024-01-11' },
        { id: '8', title: 'Weak Passwords', category: 'Access Control', severity: 'medium', likelihood: 'high', status: 'open', affectedAssets: 89, owner: 'IT Ops', createdAt: '2024-01-13' },
        { id: '9', title: 'Supply Chain Attack', category: 'Third Party', severity: 'critical', likelihood: 'low', status: 'accepted', affectedAssets: 4, owner: 'Procurement', createdAt: '2024-01-02' },
        { id: '10', title: 'Misconfigured S3 Bucket', category: 'Cloud', severity: 'high', likelihood: 'medium', status: 'closed', affectedAssets: 1, owner: 'Cloud Team', createdAt: '2024-01-01' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredRisks = useMemo(() => {
    if (!searchTerm) return risks;
    const term = searchTerm.toLowerCase();
    return risks.filter((r) => r.title.toLowerCase().includes(term) || r.category.toLowerCase().includes(term) || r.owner.toLowerCase().includes(term));
  }, [risks, searchTerm]);

  const totalPages = Math.ceil(filteredRisks.length / ITEMS_PER_PAGE);
  const paginatedRisks = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRisks.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRisks, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge className="bg-red-600">Critical</Badge>;
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge className="bg-orange-500">Medium</Badge>;
      case 'low': return <Badge variant="secondary">Low</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getLikelihoodBadge = (likelihood: string) => {
    switch (likelihood) {
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge className="bg-orange-500">Medium</Badge>;
      case 'low': return <Badge variant="secondary">Low</Badge>;
      default: return <Badge variant="outline">{likelihood}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open': return <Badge variant="destructive">Açık</Badge>;
      case 'mitigated': return <Badge className="bg-blue-500">Azaltıldı</Badge>;
      case 'accepted': return <Badge className="bg-orange-500">Kabul Edildi</Badge>;
      case 'closed': return <Badge variant="success">Kapandı</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Risk Assessment</h1>
          <p className="text-muted-foreground">Güvenlik risk değerlendirmesi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><AlertTriangle className="h-4 w-4 mr-2" />Risk Ekle</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-sm text-muted-foreground">Toplam Risk</p><p className="text-2xl font-bold">{risks.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-500/20"><TrendingUp className="h-5 w-5 text-orange-500" /></div>
            <div><p className="text-sm text-muted-foreground">Kritik/High</p><p className="text-2xl font-bold">{risks.filter((r) => r.severity === 'critical' || r.severity === 'high').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><Activity className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Açık Risk</p><p className="text-2xl font-bold">{risks.filter((r) => r.status === 'open').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20"><AlertTriangle className="h-5 w-5 text-purple-500" /></div>
            <div><p className="text-sm text-muted-foreground">Etkilenen Varlık</p><p className="text-2xl font-bold">{risks.reduce((acc, r) => acc + r.affectedAssets, 0)}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Risk ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Risks<Badge variant="secondary">{filteredRisks.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Seviye</TableHead>
                    <TableHead>Olasılık</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-center">Varlık</TableHead>
                    <TableHead>Sorumlu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRisks.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Risk bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedRisks.map((risk) => (
                      <TableRow key={risk.id}>
                        <TableCell className="font-medium">{risk.title}</TableCell>
                        <TableCell>{risk.category}</TableCell>
                        <TableCell>{getSeverityBadge(risk.severity)}</TableCell>
                        <TableCell>{getLikelihoodBadge(risk.likelihood)}</TableCell>
                        <TableCell>{getStatusBadge(risk.status)}</TableCell>
                        <TableCell className="text-center">{risk.affectedAssets}</TableCell>
                        <TableCell>{risk.owner}</TableCell>
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
