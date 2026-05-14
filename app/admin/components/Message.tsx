import { COLORS } from '@/app/admin/constants'

interface MessageProps {
  message: { type: 'success' | 'error'; text: string } | null
}

export function Message({ message }: MessageProps) {
  if (!message) return null

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        padding: '0.875rem 1rem',
        borderRadius: '8px',
        background: message.type === 'success' ? COLORS.successLight : COLORS.errorLight,
        color: message.type === 'success' ? '#065f46' : '#991b1b',
        border: `1px solid ${message.type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
        fontSize: '0.875rem',
        fontWeight: '500',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span>{message.type === 'success' ? '✓' : '✕'}</span>
        {message.text}
      </div>
    </div>
  )
}
