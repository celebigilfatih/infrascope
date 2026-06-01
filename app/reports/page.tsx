'use client';

import dynamic from 'next/dynamic';
import { RefreshCw } from 'lucide-react';

// Lazy-load Reports content + recharts (~225 kB) as a separate chunk
const ReportsContent = dynamic(
  () => import('./ReportsContent').then(mod => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    ),
  },
);

export default function ReportsPage() {
  return <ReportsContent />;
}
