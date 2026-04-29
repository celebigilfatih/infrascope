'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

// TEMPORARILY DISABLED
// The IPS / DoS Events page has been disabled. The previous implementation
// remains in git history and can be restored when the feature is re-enabled.
export default function IpsDisabledPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-xl w-full">
        <CardContent className="py-10 flex flex-col items-center text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold">IPS / DoS Events disabled</h1>
          <p className="text-sm text-muted-foreground">
            This page is temporarily disabled and is not available from the navigation.
          </p>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
