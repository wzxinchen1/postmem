'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

// 动态导入 SwaggerUI，禁用 SSR
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => <div style={{ padding: '20px', textAlign: 'center' }}>加载 API 文档中...</div>
})

export default function ApiDocsPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // 动态加载 CSS
    import('swagger-ui-react/swagger-ui.css' as any).catch(() => {})
  }, [])

  if (!mounted) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>加载中...</div>
  }

  return (
    <div style={{ height: '100vh', overflow: 'auto' }}>
      <SwaggerUI url="/swagger.json" />
    </div>
  )
}
