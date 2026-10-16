'use client';

import { uiLabel } from '@/lib/i18n/tr';

import { PageHeading } from '@/components/ui/page-heading';
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
  description: string;
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
    const fetchRisks = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/security/risky-rules');
        const result = await response.json();
        
        if (result.success && result.data) {
          setRisks(result.data);
        }
      } catch (error) {
        console.error('Error fetching risky rules:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRisks();
  }, []);

  const filteredRisks = useMemo(() => {
    // Filter to show only critical and high severity risks
    const criticalAndHighRisks = risks.filter(r => 
      r.severity === 'critical' || r.severity === 'high'
    );
    
    if (!searchTerm) return criticalAndHighRisks;
    const term = searchTerm.toLowerCase();
    return criticalAndHighRisks.filter(r => 
      r.title.toLowerCase().includes(term) || 
      r.category.toLowerCase().includes(term) || 
      r.owner.toLowerCase().includes(term)
    );
  }, [risks, searchTerm]);

  const totalPages = Math.ceil(filteredRisks.length / ITEMS_PER_PAGE);
  const paginatedRisks = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRisks.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRisks, currentPage]);

  useEffect(() => { 
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); 
  }, [totalPages, currentPage]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Kritik</Badge>;
      case 'high': return <Badge variant="destructive">Yüksek</Badge>;
      case 'medium': return <Badge variant="warning">Orta</Badge>;
      case 'low': return <Badge variant="secondary">Düşük</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) { 
      for (let i = 1; i <= totalPages; i++) pages.push(i); 
    } else {
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
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div>
          <PageHeading section="risks" description={<>Güvenlik duvarı politikalarını ve güvenlik risklerini analiz edin</>}>Risk Değerlendirmesi</PageHeading>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => window.location.reload()} aria-label="Yenile">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kritik / Yüksek Riskler</p>
                <p className="text-2xl font-bold">{filteredRisks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <TrendingUp className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kritik / Yüksek</p>
                <p className="text-2xl font-bold">
                  {risks.filter(r => r.severity === 'critical' || r.severity === 'high').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kategoriler</p>
                <p className="text-2xl font-bold">
                  {new Set(risks.map(r => r.category)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <AlertTriangle className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Etkilenen Varlıklar</p>
                <p className="text-2xl font-bold">
                  {risks.reduce((sum, r) => sum + r.affectedAssets, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input 
          placeholder="Risk ara…"
          value={searchTerm} 
          onChange={(e) => { 
            setSearchTerm(e.target.value); 
            setCurrentPage(1); 
          }} 
          className="pl-9" 
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Kritik ve Yüksek Öncelikli Riskler
            <Badge variant="secondary">{filteredRisks.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : paginatedRisks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Kritik veya yüksek öncelikli risk tespit edilmedi. Güvenlik duvarı politikaları uygun yapılandırılmış.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk Başlığı</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Önem Seviyesi</TableHead>
                    <TableHead className="text-center">Etkilenen</TableHead>
                    <TableHead>Sahip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRisks.map((risk) => (
                    <TableRow key={risk.id}>
                      <TableCell className="font-medium">{risk.title}</TableCell>
                      <TableCell>{uiLabel(risk.category)}</TableCell>
                      <TableCell>{getSeverityBadge(risk.severity)}</TableCell>
                      <TableCell className="text-center">{risk.affectedAssets}</TableCell>
                      <TableCell>{risk.owner}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Sayfa {currentPage} / {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                      disabled={currentPage === 1}
                     aria-label="Önceki sayfa">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {getPageNumbers().map((page, idx) => (
                      <React.Fragment key={idx}>
                        {page === 'ellipsis' ? (
                          <span className="px-2 text-muted-foreground">...</span>
                        ) : (
                          <Button 
                            variant={currentPage === page ? 'default' : 'outline'} 
                            size="sm" 
                            onClick={() => setCurrentPage(page)} 
                            className="w-9"
                          >
                            {page}
                          </Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                      disabled={currentPage === totalPages}
                     aria-label="Sonraki sayfa">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
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
