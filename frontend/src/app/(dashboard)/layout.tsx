'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('er_booking_theme');
    if (stored === 'light') setIsDarkMode(false);
  }, []);

  return (
    <div className="admin-root" data-theme={isDarkMode ? 'dark' : 'light'}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}