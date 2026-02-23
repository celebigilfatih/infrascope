'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Navigation progress indicator that shows:
 * 1. A top progress bar during navigation
 * 2. A subtle loading overlay with spinner
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Navigation complete - reset state
    if (isNavigating) {
      setProgress(100);
      const timeout = setTimeout(() => {
        setIsNavigating(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [pathname]);

  useEffect(() => {
    if (isNavigating && progress < 90) {
      // Simulate progress during navigation
      const increment = Math.random() * 15;
      const timeout = setTimeout(() => {
        setProgress((prev) => Math.min(prev + increment, 90));
      }, 200 + Math.random() * 300);
      return () => clearTimeout(timeout);
    }
  }, [isNavigating, progress]);

  // Intercept link clicks to trigger loading state
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement;
      
      if (link && link.href) {
        const url = new URL(link.href);
        const currentUrl = new URL(window.location.href);
        
        // Only show loading for internal navigation to different pages
        if (
          url.origin === currentUrl.origin &&
          url.pathname !== currentUrl.pathname &&
          !link.target && // Not opening in new tab
          !e.ctrlKey && // Not ctrl+click
          !e.metaKey && // Not cmd+click
          !e.shiftKey // Not shift+click
        ) {
          setIsNavigating(true);
          setProgress(10);
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  if (!isNavigating && progress === 0) return null;

  return (
    <>
      {/* Top progress bar */}
      <div 
        className={cn(
          "fixed top-0 left-0 right-0 h-1 bg-primary z-[9999] transition-all duration-300 shadow-lg",
          progress === 100 ? "opacity-0" : "opacity-100"
        )}
        style={{ 
          width: `${progress}%`,
          transition: progress === 100 ? 'width 0.3s ease-out, opacity 0.3s ease-out 0.3s' : 'width 0.4s ease-out'
        }}
      >
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-r from-transparent to-white/40" />
      </div>

      {/* Loading overlay (subtle) */}
      {isNavigating && progress < 90 && (
        <div className="fixed inset-0 z-[9998] pointer-events-none">
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] animate-in fade-in duration-300" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="bg-card border border-border rounded-lg p-4 shadow-xl">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
