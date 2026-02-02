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
import { ChevronLeft, ChevronRight, RefreshCw, Search, FileText, AlertTriangle, CheckCircle } from 'lucide-react';

interface Policy {
  id: string;
  name: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'compliant' | 'non-compliant' | 'partial';
  lastCheck: string;
  affectedAssets: number;
  description: string;
}

const ITEMS_PER_PAGE = 10;

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setPolicies([
        { id: '1', name: 'Password Policy', category: 'Access Control', severity: 'high', status: 'compliant', lastCheck: '2024-01-15', affectedAssets: 45, description: 'Minimum 12 karakter, karmaşık şifre gereksinimi' },
        { id: '2', name: 'Firewall Configuration', category: 'Network', severity: 'critical', status: 'non-compliant', lastCheck: '2024-01-14', affectedAssets: 12, description: 'Tüm sunucular firewall arkasında olmalı' },
        { id: '3', name: 'Patch Management', category: 'Vulnerability', severity: 'high', status: 'partial', lastCheck: '2024-01-10', affectedAssets: 8, description: 'Kritik yamalar 7 gün içinde uygulanmalı' },
        { id: '4', name: 'Backup Policy', category: 'Data Protection', severity: 'medium', status: 'compliant', lastCheck: '2024-01-15', affectedAssets: 156, description: 'Günlük yedekleme, 30 gün saklama' },
        { id: '5', name: 'Encryption Standards', category: 'Data Protection', severity: 'high', status: 'compliant', lastCheck: '2024-01-13', affectedAssets: 89, description: 'AES-256 şifreleme gereksinimi' },
        { id: '6', name: 'Access Review', category: 'Access Control', severity: 'medium', status: 'partial', lastCheck: '2024-01-12', affectedAssets: 234, description: 'Aylık erişim gözden geçirme' },
        { id: '7', name: 'Malware Protection', category: 'Endpoint', severity: 'critical', status: 'compliant', lastCheck: '2024-01-15', affectedAssets: 312, description: 'Antivirus tüm endpointlerde aktif olmalı' },
        { id: '8', name: 'Network Segmentation', category: 'Network', severity: 'high', status: 'non-compliant', lastCheck: '2024-01-11', affectedAssets: 15, description: 'DMZ ve iç ağ ayrımı zorunlu' },
        { id: '9', name: 'Logging Standards', category: 'Compliance', severity: 'medium', status: 'compliant', lastCheck: '2024-01-15', affectedAssets: 67, description: 'Audit logları 1 yıl saklanmalı' },
        { id: '10', name: 'Remote Access', category: 'Access Control', severity: 'high', status: 'partial', lastCheck: '2024-01-14', affectedAssets: 23, description: 'VPN ve 2FA zorunlu' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredPolicies = useMemo(() => {
    if (!searchTerm) return policies;
    const term = searchTerm.toLowerCase();
    return policies.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term)
    );
  }, [policies, searchTerm]);

  const totalPages = Math.ceil(filteredPolicies.length / ITEMS_PER_PAGE);
  const paginatedPolicies = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPolicies.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPolicies, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge className="bg-red-600">Critical</Badge>;
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge className="bg-orange-500">Medium</Badge>;
      case 'low': return <Badge variant="secondary">Low</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'compliant': return <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Uyumlu</Badge>;
      case 'non-compliant': return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Uyumsuz</Badge>;
      case 'partial': return <Badge className="bg-orange-500">Kısmi</Badge>;
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
          <h1 className="text-2xl font-bold">Security Policies</h1>
          <p className="text-muted-foreground">Güvenlik politikası uyumluluk yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><FileText className="h-4 w-4 mr-2" />Policy Ekle</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><FileText className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Toplam Policy</p><p className="text-2xl font-bold">{policies.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/20"><CheckCircle className="h-5 w-5 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Uyumlu</p><p className="text-2xl font-bold">{policies.filter((p) => p.status === 'compliant').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-sm text-muted-foreground">Uyumsuz</p><p className="text-2xl font-bold">{policies.filter((p) => p.status === 'non-compliant').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-500/20"><AlertTriangle className="h-5 w-5 text-orange-500" /></div>
            <div><p className="text-sm text-muted-foreground">Etkilenen Varlık</p><p className="text-2xl font-bold">{policies.reduce((acc, p) => acc + p.affectedAssets, 0)}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Policy ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Policies<Badge variant="secondary">{filteredPolicies.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Seviye</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-center">Etkilenen</TableHead>
                    <TableHead>Son Kontrol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPolicies.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Policy bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedPolicies.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-medium">{policy.name}</TableCell>
                        <TableCell>{policy.category}</TableCell>
                        <TableCell>{getSeverityBadge(policy.severity)}</TableCell>
                        <TableCell>{getStatusBadge(policy.status)}</TableCell>
                        <TableCell className="text-center">{policy.affectedAssets}</TableCell>
                        <TableCell className="text-muted-foreground">{policy.lastCheck}</TableCell>
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
