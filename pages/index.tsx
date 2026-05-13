import Head from 'next/head'
import Link from 'next/link'
import type { GetStaticProps } from 'next'

export default function Home() {
  return (
    <>
      <Head>
        <title>PostMem - 个人知识库系统</title>
        <meta name="description" content="基于本地嵌入向量的个人知识库系统" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '800px', padding: '2rem' }}>
          <h1 style={{ fontSize: '4rem', marginBottom: '1rem', fontWeight: 700 }}>
            PostMem
          </h1>
          <p style={{ fontSize: '1.5rem', marginBottom: '2rem', opacity: 0.9 }}>
            个人知识库系统
          </p>
          <p style={{ fontSize: '1.1rem', marginBottom: '3rem', opacity: 0.8, lineHeight: 1.6 }}>
            基于本地嵌入向量和智能文本切割的知识管理系统<br />
            支持高精度语义检索，保障数据主权
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/dashboard"
              style={{
                padding: '1rem 2rem',
                background: 'white',
                color: '#667eea',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}
            >
              🎛️ 管理界面
            </Link>
            <Link
              href="/api-docs"
              style={{
                padding: '1rem 2rem',
                background: 'rgba(255, 255, 255, 0.95)',
                color: '#667eea',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}
            >
              📚 API 文档
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '1rem 2rem',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                border: '2px solid rgba(255, 255, 255, 0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
            >
              GitHub
            </a>
          </div>

          <div style={{ marginTop: '4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
            <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
              <h3 style={{ marginBottom: '0.5rem' }}>数据隐私</h3>
              <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>嵌入向量完全本地生成</p>
            </div>
            <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</div>
              <h3 style={{ marginBottom: '0.5rem' }}>高性能</h3>
              <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>百万级向量毫秒级检索</p>
            </div>
            <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧠</div>
              <h3 style={{ marginBottom: '0.5rem' }}>智能切割</h3>
              <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>大模型驱动的语义切割</p>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {},
  }
}
