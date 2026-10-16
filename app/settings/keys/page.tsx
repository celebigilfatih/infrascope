'use client';

import { PageHeading } from '@/components/ui/page-heading';
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Plus, Key, Copy, Trash2 } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string;
}

export default function KeysPage() {
  const [keys] = useState<ApiKey[]>([
    { 
      id: '1', 
      name: 'Üretim API Anahtarı',
      key: 'sk_live_...7f8a9b', 
      createdAt: '2024-01-15',
      lastUsed: '2 saat önce'
    },
    { 
      id: '2', 
      name: 'Geliştirme Anahtarı',
      key: 'sk_dev_...3c4d5e', 
      createdAt: '2024-01-10',
      lastUsed: '1 gün önce'
    },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div>
          <PageHeading section="keys" description={<>API erişim anahtarları yönetimi</>}>API Anahtarları</PageHeading>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Yenile">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Anahtar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {keys.map((apiKey) => (
          <Card key={apiKey.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{apiKey.name}</p>
                    <p className="text-sm text-muted-foreground">{apiKey.key}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Oluşturulma: {apiKey.createdAt} | Son kullanım: {apiKey.lastUsed}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" aria-label="Kopyala">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" aria-label="Sil">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
