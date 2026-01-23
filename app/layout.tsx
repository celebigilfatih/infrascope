import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from "@/components/ui/toaster";
import { Sidebar } from '../components/layout/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'InfraScope - Kurumsal Altyapı Yönetimi',
  description: 'BT operasyonları ve altyapı yönetimi için merkezi platform',
  keywords: ['altyapı', 'DCIM', 'ağ topolojisi', 'envanter', 'yönetim'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
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
        <div className="flex min-h-screen bg-background text-foreground transition-colors duration-300">
          <Sidebar />
          {/* Main content wrapper */}
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {children}
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
