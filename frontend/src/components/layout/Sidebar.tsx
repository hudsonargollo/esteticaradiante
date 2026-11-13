'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  CalendarDays,
  Package,
  Users,
  UserCog,
  Settings,
  LogOut,
  PanelLeft,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/pos', label: 'PDV', icon: ShoppingCart, roles: ['owner', 'manager', 'cashier', 'stylist'] },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, roles: ['owner', 'manager', 'cashier', 'stylist'] },
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard, roles: ['owner', 'manager', 'cashier', 'stylist'] },
  { href: '/orders', label: 'Pedidos', icon: ClipboardList, roles: ['owner', 'manager', 'cashier', 'stylist'] },
  { href: '/products', label: 'Serviços', icon: Package, roles: ['owner', 'manager'] },
  { href: '/customers', label: 'Clientes', icon: Users, roles: ['owner', 'manager', 'cashier', 'stylist'] },
  { href: '/staff', label: 'Equipe', icon: UserCog, roles: ['owner', 'manager'] },
  { href: '/settings', label: 'Configurações', icon: Settings, roles: ['owner', 'manager'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, tenant, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('sidebar_collapsed');
    if (stored === 'true') setCollapsed(true);
    else if (window.innerWidth < 768) setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar_collapsed', String(!prev));
      return !prev;
    });
  };

  const role = user?.role || 'cashier';
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside
      className={cn(
        'flex flex-col h-screen sticky top-0 bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className={cn('flex items-center justify-between p-3 border-b border-[var(--sidebar-border)]', collapsed && 'flex-col gap-2')}>
        {!collapsed ? (
          <div className="flex items-center gap-2 min-w-0">
            <img src="/er/logo-radiante.svg" alt="" className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-base font-medium truncate">{tenant?.business_name || 'Estética Radiante'}</div>
              <div className="text-xs text-[var(--muted-foreground)] truncate">{user?.name}</div>
            </div>
          </div>
        ) : (
          <img src="/er/logo-radiante.svg" alt="" className="h-8 w-8" />
        )}
        <button onClick={toggle} className="p-1.5 rounded-md hover:bg-[var(--sidebar-accent)] shrink-0" title="Alternar menu lateral">
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]'
                  : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-[var(--sidebar-border)]">
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}