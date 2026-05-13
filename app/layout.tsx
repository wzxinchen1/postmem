import './globals.css'

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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}