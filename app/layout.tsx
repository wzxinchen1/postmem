import './globals.css'
import './global_flex.scss'
import { AntdRegistry } from '@ant-design/nextjs-registry'

export const metadata = {
  title: 'PostMem',
  description: 'Personal knowledge base system with local embedding and configurable LLM chunking',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <body style={{ display: 'flex', flexDirection: 'column' }}>
        <AntdRegistry>
          {children}
        </AntdRegistry>
      </body>
    </html>
  )
}