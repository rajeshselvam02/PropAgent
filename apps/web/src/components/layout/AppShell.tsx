/**
 * App Shell
 * 
 * Main layout with sidebar and topbar for authenticated users
 */

'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSessionStore, useIsManager } from '@/lib/state/stores/session';
import { 
  Users, 
  BarChart3, 
  FolderKanban, 
  Calendar, 
  Settings, 
  CreditCard,
  LayoutDashboard,
  Briefcase,
  LogOut,
  Bell,
  Search,
} from 'lucide-react';

const agentNavItems = [
  { href: '/leads', label: 'Leads', icon: Briefcase },
  { href: '/pipeline', label: 'Pipeline', icon: FolderKanban },
  { href: '/followups', label: 'Follow-ups', icon: Calendar },
  { href: '/workspace', label: 'My Workspace', icon: LayoutDashboard },
];

const managerNavItems = [
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/team', label: 'Team', icon: Users },
];

const adminNavItems = [
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useSessionStore((state) => state.user);
  const tenant = useSessionStore((state) => state.tenant);
  const logout = useSessionStore((state) => state.logout);
  const isManager = useIsManager();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen bg-bg">
      {/* Sidebar */}
      <aside className="w-60 bg-surface border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold text-text">PropAgent</h1>
          {tenant && (
            <p className="text-xs text-muted truncate">{tenant.name}</p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
          {/* Agent Navigation */}
          <div className="space-y-1">
            {agentNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </div>

          {/* Manager Navigation */}
          {isManager && (
            <>
              <div className="my-3 border-t border-border" />
              <div className="space-y-1">
                {managerNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Admin Navigation */}
          {user?.role === 'admin' && (
            <>
              <div className="my-3 border-t border-border" />
              <div className="space-y-1">
                {adminNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-medium text-sm">
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{user?.name}</p>
              <p className="text-xs text-muted capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-muted hover:bg-bg hover:text-text"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-surface border-b border-border flex items-center px-4 gap-4">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder="Search leads... (⌘K)"
                className="input pl-9 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <button className="p-2 rounded-md text-muted hover:bg-bg hover:text-text relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-danger rounded-full" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
