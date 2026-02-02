'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, GitCommit, User, Clock, Filter, RefreshCw, ChevronRight } from 'lucide-react';

interface Change {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
  user: string;
  timestamp: string;
}

export default function ChangesPage() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setTimeout(() => {
      setChanges([
        {
          id: '1',
          type: 'update',
          entity: 'device',
          entityName: 'SRV-DB-01',
          field: 'status',
          oldValue: 'INACTIVE',
          newValue: 'ACTIVE',
          user: 'admin@infrascope.io',
          timestamp: new Date().toISOString(),
        },
        {
          id: '2',
          type: 'create',
          entity: 'device',
          entityName: 'SRV-WEB-03',
          field: '-',
          oldValue: '-',
          newValue: 'Yeni cihaz eklendi',
          user: 'admin@infrascope.io',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
        },
        {
          id: '3',
          type: 'delete',
          entity: 'connection',
          entityName: 'CONN-045',
          field: '-',
          oldValue: '-',
          newValue: 'Bağlantı silindi',
          user: 'network-admin@infrascope.io',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: '4',
          type: 'update',
          entity: 'rack',
          entityName: 'RACK-A-12',
          field: 'location',
          oldValue: 'Floor 1',
          newValue: 'Floor 2',
          user: 'admin@infrascope.io',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: '5',
          type: 'update',
          entity: 'device',
          entityName: 'FW-EDGE-01',
          field: 'firmware',
          oldValue: '7.0.1',
          newValue: '7.2.0',
          user: 'network-admin@infrascope.io',
          timestamp: new Date(Date.now() - 14400000).toISOString(),
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const getChangeIcon = (type: string) => {
    switch (type) {
      case 'create': return <div className="p-1.5 rounded-full bg-green-500/20"><GitCommit className="h-4 w-4 text-green-500" /></div>;
      case 'update': return <div className="p-1.5 rounded-full bg-blue-500/20"><GitCommit className="h-4 w-4 text-blue-500" /></div>;
      case 'delete': return <div className="p-1.5 rounded-full bg-red-500/20"><GitCommit className="h-4 w-4 text-red-500" /></div>;
      default: return <div className="p-1.5 rounded-full bg-gray-500/20"><GitCommit className="h-4 w-4 text-gray-500" /></div>;
    }
  };

  const getChangeBadge = (type: string) => {
    switch (type) {
      case 'create': return <Badge className="bg-green-500">Oluşturma</Badge>;
      case 'update': return <Badge variant="default">Güncelleme</Badge>;
      case 'delete': return <Badge variant="destructive">Silme</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const filteredChanges = changes.filter(c => {
    if (filter === 'all') return true;
    return c.type === filter;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Son Değişiklikler</h1>
          <p className="text-muted-foreground">Sistem değişiklik kaydı ve denetim izi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtrele
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <GitCommit className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam</p>
                <p className="text-2xl font-bold">{changes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <GitCommit className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Oluşturma</p>
                <p className="text-2xl font-bold text-green-500">{changes.filter(c => c.type === 'create').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/20">
                <GitCommit className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Güncelleme</p>
                <p className="text-2xl font-bold">{changes.filter(c => c.type === 'update').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <GitCommit className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Silme</p>
                <p className="text-2xl font-bold text-red-500">{changes.filter(c => c.type === 'delete').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['all', 'create', 'update', 'delete'].map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Tümü' : f === 'create' ? 'Oluşturma' : f === 'update' ? 'Güncelleme' : 'Silme'}
          </Button>
        ))}
      </div>

      {/* Changes List */}
      <Card>
        <CardHeader>
          <CardTitle>Değişiklik Geçmişi</CardTitle>
          <CardDescription>{filteredChanges.length} değişiklik bulundu</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredChanges.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Değişiklik bulunmuyor</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredChanges.map((change) => (
                <div
                  key={change.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                >
                  {getChangeIcon(change.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getChangeBadge(change.type)}
                      <Badge variant="outline">{change.entity}</Badge>
                    </div>
                    <h4 className="font-semibold">{change.entityName}</h4>
                    {change.type === 'update' ? (
                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">{change.field}: </span>
                        <span className="line-through text-red-500 mr-2">{change.oldValue}</span>
                        <ChevronRight className="inline h-4 w-4 mx-1" />
                        <span className="text-green-500 font-medium">{change.newValue}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">{change.newValue}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {change.user}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(change.timestamp).toLocaleString('tr-TR')}
                      </span>
                    </div>
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
