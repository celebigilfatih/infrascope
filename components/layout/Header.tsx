'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const Header: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    { name: 'Panel', href: '/dashboard', icon: '📊' },
    { name: 'Cihazlar', href: '/devices', icon: '🖥️' },
    { name: 'Konumlar', href: '/locations', icon: '📍' },
    { name: 'Servisler', href: '/services', icon: '⚙️' },
    { name: 'Ağ Topolojisi', href: '/network', icon: '🕸️' },
  ];

  return (
    <header className="bg-[#000033] border-b border-blue-900 sticky top-0 z-[1000]">
      <div className="max-w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex-shrink-0 flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                I
              </div>
              <span className="ml-3 text-xl font-bold text-white tracking-tight">
                InfraScope
              </span>
            </Link>
            <nav className="ml-10 flex space-x-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2
                      ${isActive 
                        ? 'bg-blue-900 text-white' 
                        : 'text-blue-200 hover:bg-blue-800 hover:text-white'}
                    `}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-xs font-semibold text-white leading-none">Yönetici</p>
              <p className="text-[10px] text-blue-300 mt-1 uppercase tracking-wider">Sistem Yöneticisi</p>
            </div>
            <div className="w-10 h-10 bg-blue-800 rounded-full border-2 border-blue-700 shadow-sm flex items-center justify-center text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
