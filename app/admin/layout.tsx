'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

const COLORS = {
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryLight: '#eff6ff',
  secondary: '#64748b',
  success: '#10b981',
  successLight: '#d1fae5',
  error: '#ef4444',
  errorLight: '#fee2e2',
  warning: '#f59e0b',
  border: '#e2e8f0',
  bg: '#f8fafc',
  cardBg: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
}

const menuItems = [
  { id: 'dashboard', label: '概览', icon: '📊', href: '/admin' },
  { id: 'providers', label: '提供商管理', icon: '🔌', href: '/admin/providers' },
  { id: 'models', label: '模型管理', icon: '🤖', href: '/admin/models' },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      {/* 顶部导航栏 */}
      <header style={{ background: COLORS.cardBg, borderBottom: `1px solid ${COLORS.border}`, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '32px',
                height: '32px',
                background: `linear-gradient(135deg, ${COLORS.primary} 0%, #8b5cf6 100%)`,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '18px',
                fontWeight: 'bold'
              }}>
                P
              </div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0, color: COLORS.text }}>
                PostMem Dashboard
              </h1>
            </div>
            <Link
              href="/"
              style={{
                padding: '0.5rem 1rem',
                color: COLORS.textSecondary,
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: '500',
                borderRadius: '6px',
                transition: 'all 0.2s'
              }}
            >
              ← 返回首页
            </Link>
          </div>

          {/* 顶部菜单 */}
          <nav style={{ display: 'flex', gap: '0', height: '48px' }}>
            {menuItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    padding: '0 1.25rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                    color: isActive ? COLORS.primary : COLORS.textSecondary,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? '600' : '500',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      {/* 主内容区 */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        {children}
      </main>
    </div>
  )
}