'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const Header: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '📊' },
    { name: 'Devices', href: '/devices', icon: '🖥️' },
    { name: 'Locations', href: '/locations', icon: '📍' },
    { name: 'Services', href: '/services', icon: '⚙️' },
    { name: 'Network', href: '/network', icon: '🕸️' },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-[1000]">
      <div className="max-w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex-shrink-0 flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                I
              </div>
              <span className="ml-3 text-xl font-bold text-gray-900 tracking-tight">
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
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
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
              <p className="text-xs font-semibold text-gray-900 leading-none">Admin User</p>
              <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Administrator</p>
            </div>
            <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-gray-600">
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
