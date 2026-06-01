import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from "@/components/ui/toaster";
import { LayoutShell } from '../components/layout/LayoutShell';
import { NavigationProgress } from '@/components/ui/navigation-progress';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'InfraScope - Kurumsal Altyapı Yönetimi',
  description: 'BT operasyonları ve altyapı yönetimi için merkezi platform',
  keywords: ['altyapı', 'DCIM', 'ağ topolojisi', 'envanter', 'yönetim'],
  icons: {
    icon: '/images/favicon.ico',
    apple: '/images/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" translate="no" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme') || 'light';
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <NavigationProgress />
        <LayoutShell>
          {children}
        </LayoutShell>
        <Toaster />
      </body>
    </html>
  );
}
