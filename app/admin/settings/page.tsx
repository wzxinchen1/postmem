'use client'

import { useState, useEffect } from 'react'
import { message } from 'antd'
import { COLORS } from '../constants'

interface AppSettings {
  maxContentLength: number
  defaultTopK: number
  defaultContextWindow: number
  defaultPageSize: number
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    maxContentLength: 20000,
    defaultTopK: 5,
    defaultContextWindow: 1,
    defaultPageSize: 20,
  })
  const [loading, setLoading] = useState(false)
  const [msg, contextHolder] = message.useMessage()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.success) {
        setSettings(data.data.settings)
      }
    } catch (err) {
      msg.error('加载设置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (data.success) {
        msg.success('设置已保存')
      } else {
        msg.error(data.error?.message || '保存失败')
      }
    } catch (err) {
      msg.error('网络请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {contextHolder}

      <div style={{ maxWidth: '800px' }}>
        {/* 说明卡片 */}
        <div style={{
          background: COLORS.primaryLight,
          border: `1px solid ${COLORS.primary}`,
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '0.875rem', color: COLORS.primary, fontWeight: '500' }}>
            💡 提示
          </div>
          <div style={{ fontSize: '0.8125rem', color: COLORS.textSecondary, marginTop: '0.5rem' }}>
            应用设置会影响系统的默认行为。修改后立即生效，无需重启服务。
          </div>
        </div>

        {/* 设置表单 */}
        <div style={{
          background: COLORS.cardBg,
          borderRadius: '10px',
          border: `1px solid ${COLORS.border}`,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '1.25rem 1.5rem',
            borderBottom: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
          }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: COLORS.text }}>
              应用设置
            </h2>
          </div>

          <div style={{ padding: '1.5rem' }}>
            {/* 最大内容长度 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: COLORS.text,
              }}>
                最大内容长度
              </label>
              <input
                type="number"
                value={settings.maxContentLength}
                onChange={e => setSettings({ ...settings, maxContentLength: Number(e.target.value) })}
                min={1000}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  background: COLORS.bg,
                }}
              />
              <div style={{ fontSize: '0.75rem', color: COLORS.textMuted, marginTop: '0.375rem' }}>
                入库内容的最大字符数限制（最小 1000）
              </div>
            </div>

            {/* 默认检索数量 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: COLORS.text,
              }}>
                默认检索数量 (Top K)
              </label>
              <input
                type="number"
                value={settings.defaultTopK}
                onChange={e => setSettings({ ...settings, defaultTopK: Number(e.target.value) })}
                min={1}
                max={100}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  background: COLORS.bg,
                }}
              />
              <div style={{ fontSize: '0.75rem', color: COLORS.textMuted, marginTop: '0.375rem' }}>
                语义检索时返回的最相关结果数量（1-100）
              </div>
            </div>

            {/* 默认上下文窗口 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: COLORS.text,
              }}>
                默认上下文窗口
              </label>
              <input
                type="number"
                value={settings.defaultContextWindow}
                onChange={e => setSettings({ ...settings, defaultContextWindow: Number(e.target.value) })}
                min={0}
                max={5}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  background: COLORS.bg,
                }}
              />
              <div style={{ fontSize: '0.75rem', color: COLORS.textMuted, marginTop: '0.375rem' }}>
                检索结果包含的相邻片段数量（0-5）
              </div>
            </div>

            {/* 默认分页大小 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: COLORS.text,
              }}>
                默认分页大小
              </label>
              <input
                type="number"
                value={settings.defaultPageSize}
                onChange={e => setSettings({ ...settings, defaultPageSize: Number(e.target.value) })}
                min={10}
                max={100}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  outline: 'none',
                  background: COLORS.bg,
                }}
              />
              <div style={{ fontSize: '0.75rem', color: COLORS.textMuted, marginTop: '0.375rem' }}>
                列表浏览时每页显示的数量（10-100）
              </div>
            </div>

            {/* 保存按钮 */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: loading ? COLORS.border : COLORS.primary,
                  color: loading ? COLORS.textMuted : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                }}
              >
                {loading ? '保存中...' : '保存设置'}
              </button>
              <button
                onClick={loadSettings}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'transparent',
                  color: COLORS.textSecondary,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                }}
              >
                重置
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
