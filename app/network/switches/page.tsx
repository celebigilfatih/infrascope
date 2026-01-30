'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Globe, RefreshCw, Search, MoreHorizontal, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Switch {
  id: string;
  name: string;
  ip: string;
  model: string;
  vendor: string;
  portCount: number;
  usedPorts: number;
  upPorts: number;
  downPorts: number;
  cpu: number;
  memory: number;
  status: 'online' | 'offline' | 'warning';
}

export default function SwitchesPage() {
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setTimeout(() => {
      setSwitches([
        {
          id: '1',
          name: 'SW-CORE-01',
          ip: '10.0.0.1',
          model: 'Cisco Catalyst 9300',
          vendor: 'Cisco',
          portCount: 48,
          usedPorts: 42,
          upPorts: 40,
          downPorts: 2,
          cpu: 45,
          memory: 62,
          status: 'online',
        },
        {
          id: '2',
          name: 'SW-DIST-01',
          ip: '10.0.1.1',
          model: 'Cisco Catalyst 9200',
          vendor: 'Cisco',
          portCount: 48,
          usedPorts: 38,
          upPorts: 38,
          downPorts: 0,
          cpu: 32,
          memory: 48,
          status: 'online',
        },
        {
          id: '3',
          name: 'SW-ACC-01',
          ip: '10.0.2.1',
          model: 'Aruba 2930F',
          vendor: 'Aruba',
          portCount: 24,
          usedPorts: 20,
          upPorts: 19,
          downPorts: 1,
          cpu: 28,
          memory: 55,
          status: 'warning',
        },
        {
          id: '4',
          name: 'SW-CORE-02',
          ip: '10.0.0.2',
          model: 'Cisco Catalyst 9300',
          vendor: 'Cisco',
          portCount: 48,
          usedPorts: 44,
          upPorts: 44,
          downPorts: 0,
          cpu: 52,
          memory: 65,
          status: 'online',
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online': return <Badge variant="success">Çevrimiçi</Badge>;
      case 'offline': return <Badge variant="destructive">Çevrimdışı</Badge>;
      case 'warning': return <Badge className="bg-orange-500">Uyarı</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredSwitches = switches.filter(sw =>
    sw.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sw.ip.includes(searchQuery) ||
    sw.model.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Switches</h1>
          <p className="text-muted-foreground">Anahtar cihaz yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Globe className="h-4 w-4 mr-2" />
            Switch Ekle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Globe className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Switch</p>
                <p className="text-2xl font-bold">{switches.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Activity className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktif Port</p>
                <p className="text-2xl font-bold">{switches.reduce((acc, s) => acc + s.upPorts, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <Activity className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Down Port</p>
                <p className="text-2xl font-bold text-red-500">{switches.reduce((acc, s) => acc + s.downPorts, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Globe className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ortalama CPU</p>
                <p className="text-2xl font-bold">{Math.round(switches.reduce((acc, s) => acc + s.cpu, 0) / switches.length)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Switch ara (isim, IP, model)..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      {/* Switches List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          filteredSwitches.map((sw) => (
            <Card key={sw.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-lg">{sw.name}</CardTitle>
                      {getStatusBadge(sw.status)}
                    </div>
                    <CardDescription>{sw.model} - {sw.vendor}</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">IP: {sw.ip}</span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-muted-foreground">{sw.portCount} Port</span>
                </div>

                {/* Port Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-green-500/10">
                    <p className="text-lg font-bold text-green-500">{sw.upPorts}</p>
                    <p className="text-xs text-muted-foreground">Up</p>
                  </div>
                  <div className="p-2 rounded bg-red-500/10">
                    <p className="text-lg font-bold text-red-500">{sw.downPorts}</p>
                    <p className="text-xs text-muted-foreground">Down</p>
                  </div>
                  <div className="p-2 rounded bg-muted">
                    <p className="text-lg font-bold">{sw.usedPorts}</p>
                    <p className="text-xs text-muted-foreground">Kullanılan</p>
                  </div>
                </div>

                {/* CPU & Memory */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">CPU</span>
                      <span className="font-medium">{sw.cpu}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${sw.cpu}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Memory</span>
                      <span className="font-medium">{sw.memory}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500" style={{ width: `${sw.memory}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    Port Listesi
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    Performans
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
