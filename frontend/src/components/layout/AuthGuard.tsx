'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const PUBLIC_PATHS = ['/auth/login'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, needsSetup, loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;

    if (needsSetup && pathname !== '/setup') {
      router.replace('/setup');
      return;
    }
    if (!needsSetup && pathname === '/setup') {
      router.replace(user ? '/pos' : '/auth/login');
      return;
    }
    if (!needsSetup && !user && !PUBLIC_PATHS.includes(pathname || '') && pathname !== '/setup') {
      router.replace('/auth/login');
      return;
    }
    if (user && pathname === '/auth/login') {
      router.replace('/pos');
    }
  }, [loading, needsSetup, user, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}
