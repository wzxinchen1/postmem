import { COLORS, MENU_ITEMS } from '@/app/admin/constants'

interface TabSelectorProps {
  activeTab: 'ingest' | 'search' | 'list' | 'stats'
  setActiveTab: (tab: 'ingest' | 'search' | 'list' | 'stats') => void
}

export function TabSelector({ activeTab, setActiveTab }: TabSelectorProps) {
  return (
    <div style={{
      background: COLORS.cardBg,
      borderRadius: '10px',
      border: `1px solid ${COLORS.border}`,
      marginBottom: '1.5rem',
      display: 'flex',
      gap: '0',
      overflow: 'hidden'
    }}>
      {MENU_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          style={{
            padding: '0.75rem 1.25rem',
            background: activeTab === item.id ? COLORS.primaryLight : 'transparent',
            border: 'none',
            borderBottom: activeTab === item.id ? `2px solid ${COLORS.primary}` : '2px solid transparent',
            color: activeTab === item.id ? COLORS.primary : COLORS.textSecondary,
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: activeTab === item.id ? '600' : '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flex: 1
          }}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
