'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Search, AlertTriangle } from 'lucide-react';

export default function SprawlPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">VM Sprawl</h1>
          <p className="text-muted-foreground">Kullanılmayan kaynakların tespiti</p>
        </div>
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Orphaned VMs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Sahipsiz VM taraması sonuçları.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Unused Resources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Düşük kullanımlı kaynak raporu.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
