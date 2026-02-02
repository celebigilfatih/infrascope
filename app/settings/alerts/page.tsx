'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RefreshCw, Bell, Mail, Webhook } from 'lucide-react';

interface AlertChannel {
  id: string;
  name: string;
  type: 'email' | 'webhook' | 'slack';
  enabled: boolean;
}

export default function AlertsPage() {
  const [channels, setChannels] = useState<AlertChannel[]>([
    { id: '1', name: 'Admin Email', type: 'email', enabled: true },
    { id: '2', name: 'Slack Notifications', type: 'slack', enabled: false },
    { id: '3', name: 'Webhook API', type: 'webhook', enabled: true },
  ]);

  const toggleChannel = (id: string) => {
    setChannels(channels.map(c => 
      c.id === id ? { ...c, enabled: !c.enabled } : c
    ));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="h-5 w-5" />;
      case 'webhook': return <Webhook className="h-5 w-5" />;
      default: return <Bell className="h-5 w-5" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alert Settings</h1>
          <p className="text-muted-foreground">Bildirim kanalları ve yapılandırma</p>
        </div>
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {channels.map((channel) => (
          <Card key={channel.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getIcon(channel.type)}
                  <div>
                    <p className="font-medium">{channel.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">{channel.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`channel-${channel.id}`} className="sr-only">
                    {channel.name}
                  </Label>
                  <Switch
                    id={`channel-${channel.id}`}
                    checked={channel.enabled}
                    onCheckedChange={() => toggleChannel(channel.id)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
