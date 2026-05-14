import { COLORS } from '@/app/admin/constants'

interface KBSelectorProps {
  kbName: string
  setKbName: (name: string) => void
}

export function KBSelector({ kbName, setKbName }: KBSelectorProps) {
  return (
    <div style={{
      background: COLORS.cardBg,
      padding: '1.25rem 1.5rem',
      borderRadius: '10px',
      marginBottom: '1.5rem',
      border: `1px solid ${COLORS.border}`,
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
    }}>
      <label style={{
        display: 'block',
        marginBottom: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: '600',
        color: COLORS.text
      }}>
        知识库名称
      </label>
      <input
        type="text"
        value={kbName}
        onChange={(e) => setKbName(e.target.value)}
        placeholder="输入知识库名称（如：my-knowledge-base）"
        style={{
          width: '100%',
          padding: '0.625rem 0.875rem',
          border: `1px solid ${COLORS.border}`,
          borderRadius: '6px',
          fontSize: '0.875rem',
          outline: 'none',
          transition: 'border-color 0.2s',
          background: COLORS.bg
        }}
      />
    </div>
  )
}
