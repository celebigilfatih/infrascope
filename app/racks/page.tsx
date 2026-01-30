'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Search, Grid, Server, RefreshCw, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Rack {
  id: string;
  name: string;
  location: string;
  capacity: number;
  used: number;
  status: 'active' | 'maintenance' | 'offline';
  devices: number;
}

export default function RacksPage() {
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setTimeout(() => {
      setRacks([
        { id: '1', name: 'RACK-A-01', location: 'Veri Merkezi A - Floor 1', capacity: 42, used: 38, status: 'active', devices: 24 },
        { id: '2', name: 'RACK-A-02', location: 'Veri Merkezi A - Floor 1', capacity: 42, used: 35, status: 'active', devices: 22 },
        { id: '3', name: 'RACK-B-01', location: 'Veri Merkezi A - Floor 2', capacity: 42, used: 42, status: 'active', devices: 28 },
        { id: '4', name: 'RACK-B-02', location: 'Veri Merkezi A - Floor 2', capacity: 42, used: 28, status: 'maintenance', devices: 18 },
        { id: '5', name: 'RACK-C-01', location: 'Veri Merkezi B - Floor 1', capacity: 48, used: 12, status: 'active', devices: 8 },
        { id: '6', name: 'RACK-C-02', location: 'Veri Merkezi B - Floor 1', capacity: 48, used: 0, status: 'offline', devices: 0 },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredRacks = racks.filter(rack =>
    rack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rack.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getUsageColor = (used: number, capacity: number) => {
    const percentage = (used / capacity) * 100;
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="success">Aktif</Badge>;
      case 'maintenance': return <Badge variant="warning">Bakımda</Badge>;
      case 'offline': return <Badge variant="destructive">Çevrimdışı</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Racks</h1>
          <p className="text-muted-foreground">Veri merkezi rack yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Rack Ekle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Grid className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Rack</p>
                <p className="text-2xl font-bold">{racks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Server className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Cihaz</p>
                <p className="text-2xl font-bold">{racks.reduce((acc, r) => acc + r.devices, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Grid className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ortalama Doluluk</p>
                <p className="text-2xl font-bold">
                  {Math.round(racks.reduce((acc, r) => acc + (r.used / r.capacity) * 100, 0) / racks.length)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <Grid className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kritik Doluluk</p>
                <p className="text-2xl font-bold text-red-500">
                  {racks.filter(r => (r.used / r.capacity) * 100 >= 90).length}
                </p>
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
            placeholder="Rack ara..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      {/* Racks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredRacks.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Grid className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Rack bulunamadı</p>
          </div>
        ) : (
          filteredRacks.map((rack) => (
            <Card key={rack.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{rack.name}</CardTitle>
                    <CardDescription>{rack.location}</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  {getStatusBadge(rack.status)}
                  <span className="text-sm text-muted-foreground">
                    {rack.devices} cihaz
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Doluluk</span>
                    <span className="font-medium">{rack.used}/{rack.capacity} U</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all", getUsageColor(rack.used, rack.capacity))}
                      style={{ width: `${(rack.used / rack.capacity) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    Görüntüle
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    Düzenle
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
