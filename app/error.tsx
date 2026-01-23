'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Client-side exception:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-destructive/50 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-800">
          <span className="text-4xl">⚠️</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Uygulama Hatası</h2>
        <p className="text-blue-300 mb-8 text-sm">
          Beklenmeyen bir hata oluştu. Lütfen sayfayı yenileyin veya tekrar deneyin.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20"
          >
            Tekrar Dene
          </button>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-full py-3 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 font-bold rounded-xl transition-all border border-blue-800"
          >
            Panale Dön
          </button>
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-8 p-4 bg-black/40 rounded-lg text-left overflow-auto max-h-40">
            <p className="text-red-400 font-mono text-xs">{error.message}</p>
            {error.stack && <pre className="text-[10px] text-gray-500 mt-2">{error.stack}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}
