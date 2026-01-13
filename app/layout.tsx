import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'InfraScope - Enterprise Infrastructure Management',
  description: 'Centralized platform for managing IT operations and infrastructure',
  keywords: ['infrastructure', 'DCIM', 'network topology', 'inventory', 'management'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          {/* Main content wrapper */}
          <main className="w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
