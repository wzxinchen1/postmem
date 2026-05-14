// 样式常量
export const COLORS = {
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

// 菜单项配置
export const MENU_ITEMS = [
  { id: 'ingest', label: '知识库管理', icon: '📚' },
  { id: 'search', label: '语义检索', icon: '🔍' },
  { id: 'list', label: '列表管理', icon: '📋' },
  { id: 'stats', label: '统计概览', icon: '📊' },
] as const
