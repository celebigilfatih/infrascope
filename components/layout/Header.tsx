'use client';

import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { UserProfile } from './UserProfile';

export const Header: React.FC = () => {
  const [notificationCount, setNotificationCount] = useState(0);

  // TODO: Fetch real notification count from API
  useEffect(() => {
    // Mock: will be replaced with real alarm/notification count
    setNotificationCount(3);
  }, []);

  return (
    <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-[1000]">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left: Empty space (navigation moved to sidebar) */}
          <div className="flex-1" />

          {/* Right: Notifications + Profile */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-10 w-10">
                  <Bell className="h-5 w-5" />
                  {notificationCount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                    >
                      {notificationCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-80 p-4">
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm">Bildirimler</h3>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Bildirim yakında aktif olacak
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* User Profile */}
            <UserProfile compact />
          </div>
        </div>
      </div>
    </header>
  );
};
