'use client';

import dynamic from 'next/dynamic';
import { ReactFlowProvider } from 'reactflow';

const NetworkTopologyContent = dynamic(
  () => import('./NetworkTopologyContent').then(mod => mod.NetworkTopologyContent),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Topoloji yükleniyor...</p>
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
