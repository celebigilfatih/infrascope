import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
    <html lang="tr" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <div className="min-h-screen bg-[#000033]">
          {/* Main content wrapper */}
          <main className="w-full">
            {children}
          </main>
        </div>
        <ToastContainer position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
