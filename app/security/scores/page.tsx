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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SecurityScore {
  id: string;
  category: string;
  score: number;
  previousScore: number;
  trend: 'up' | 'down' | 'stable';
  maxScore: number;
  issues: number;
  lastCheck: string;
}

const ITEMS_PER_PAGE = 10;

export default function ScoresPage() {
  const [scores, setScores] = useState<SecurityScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setScores([
        { id: '1', category: 'Network Security', score: 85, previousScore: 78, trend: 'up', maxScore: 100, issues: 5, lastCheck: '2024-01-15' },
        { id: '2', category: 'Endpoint Protection', score: 72, previousScore: 75, trend: 'down', maxScore: 100, issues: 12, lastCheck: '2024-01-15' },
        { id: '3', category: 'Access Control', score: 90, previousScore: 88, trend: 'up', maxScore: 100, issues: 3, lastCheck: '2024-01-15' },
        { id: '4', category: 'Data Protection', score: 68, previousScore: 70, trend: 'down', maxScore: 100, issues: 8, lastCheck: '2024-01-14' },
        { id: '5', category: 'Vulnerability Management', score: 55, previousScore: 50, trend: 'up', maxScore: 100, issues: 15, lastCheck: '2024-01-15' },
        { id: '6', category: 'Incident Response', score: 78, previousScore: 78, trend: 'stable', maxScore: 100, issues: 4, lastCheck: '2024-01-13' },
        { id: '7', category: 'Compliance', score: 82, previousScore: 80, trend: 'up', maxScore: 100, issues: 6, lastCheck: '2024-01-15' },
        { id: '8', category: 'Application Security', score: 65, previousScore: 60, trend: 'up', maxScore: 100, issues: 10, lastCheck: '2024-01-14' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredScores = useMemo(() => {
    if (!searchTerm) return scores;
    const term = searchTerm.toLowerCase();
    return scores.filter((s) => s.category.toLowerCase().includes(term));
  }, [scores, searchTerm]);

  const totalPages = Math.ceil(filteredScores.length / ITEMS_PER_PAGE);
  const paginatedScores = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredScores.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredScores, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-orange-500';
    return 'text-red-500';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendBadge = (trend: string, current: number, previous: number) => {
    if (trend === 'up') return <Badge className="bg-green-500/20 text-green-500">+{current - previous}</Badge>;
    if (trend === 'down') return <Badge className="bg-red-500/20 text-red-500">{current - previous}</Badge>;
    return <Badge variant="secondary">0</Badge>;
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

  const overallScore = Math.round(scores.reduce((acc, s) => acc + s.score, 0) / scores.length);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Security Scores</h1>
          <p className="text-muted-foreground">Güvenlik skoru takibi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><Activity className="h-4 w-4 mr-2" />Yenile</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="col-span-3">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Genel Güvenlik Skoru</p>
                <p className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>{overallScore}</p>
                <p className="text-sm text-muted-foreground">/100</p>
              </div>
              <div className="flex-1 ml-8">
                <div className="space-y-2">
                  {scores.slice(0, 4).map((s) => (
                    <div key={s.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{s.category}</span>
                        <span className={getScoreColor(s.score)}>{s.score}</span>
                      </div>
                      <Progress value={s.score} className="h-2" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><Activity className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Aktif Kategori</p><p className="text-2xl font-bold">{scores.length}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Kategori ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Security Scores<Badge variant="secondary">{filteredScores.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-center">Skor</TableHead>
                    <TableHead className="text-center">Önceki</TableHead>
                    <TableHead className="text-center">Trend</TableHead>
                    <TableHead className="text-center">Issue</TableHead>
                    <TableHead>Son Kontrol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedScores.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sonuç bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedScores.map((score) => (
                      <TableRow key={score.id}>
                        <TableCell className="font-medium">{score.category}</TableCell>
                        <TableCell className="text-center">
                          <span className={`text-2xl font-bold ${getScoreColor(score.score)}`}>{score.score}</span>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">{score.previousScore}</TableCell>
                        <TableCell className="text-center flex items-center justify-center gap-2">
                          {getTrendIcon(score.trend)}
                          {getTrendBadge(score.trend, score.score, score.previousScore)}
                        </TableCell>
                        <TableCell className="text-center"><Badge variant="outline">{score.issues} issue</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{score.lastCheck}</TableCell>
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
