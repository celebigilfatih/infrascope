'use client';

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
      name: 'Production API Key', 
      key: 'sk_live_...7f8a9b', 
      createdAt: '2024-01-15',
      lastUsed: '2 hours ago'
    },
    { 
      id: '2', 
      name: 'Development Key', 
      key: 'sk_dev_...3c4d5e', 
      createdAt: '2024-01-10',
      lastUsed: '1 day ago'
    },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">API erişim anahtarları yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
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
                      Created: {apiKey.createdAt} | Last used: {apiKey.lastUsed}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive">
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
