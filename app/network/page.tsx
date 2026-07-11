'use client';

import dynamic from 'next/dynamic';
import { ReactFlowProvider } from 'reactflow';

const NetworkTopologyContent = dynamic(
  () => import('./NetworkTopologyContent').then(mod => mod.NetworkTopologyContent),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[520px] flex-1 items-center justify-center bg-background">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="mt-3 text-sm font-medium text-foreground">Topoloji hazırlanıyor</p>
          <p className="mt-1 text-sm text-muted-foreground">Ağ görünümü yükleniyor.</p>
        </div>
      </div>
    ),
  },
);

export default function NetworkTopologyPage() {
  return (
    <ReactFlowProvider>
      <NetworkTopologyContent />
    </ReactFlowProvider>
  );
}
