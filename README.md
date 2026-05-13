# PostMem - 个人知识库系统

基于 Next.js 的个人知识库系统，支持本地嵌入向量和可配置的大模型文本切割。

## 核心特性

- 🎯 **高精度语义检索**：使用 bge-m3 本地嵌入模型，支持百万级向量毫秒级检索
- 🔧 **灵活的切割策略**：支持本地 Ollama 或云端大模型（OpenAI/Anthropic）智能切割
- 🔒 **数据主权保障**：嵌入向量完全本地生成，切割模型可配置
- 📚 **上下文窗口**：检索时自动返回相邻片段，还原完整推理上下文
- 🚀 **类型安全**：Prisma ORM + TypeScript，完整的类型安全保障
- 📖 **API 文档**：集成 Swagger UI，提供完整的 API 文档

## 技术栈

- **框架**: Next.js 14 (Page Router)
- **数据库**: PostgreSQL 18 + pgvector
- **ORM**: Prisma
- **嵌入模型**: Ollama + bge-m3
- **切割模型**: Ollama / OpenAI / Anthropic (可配置)
- **依赖注入**: awilix
- **API 文档**: OpenAPI 3.0 + Swagger UI

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

关键配置项：
- `DATABASE_URL`: PostgreSQL 连接字符串
- `OLLAMA_BASE_URL`: Ollama 服务地址
- `CHUNK_MODEL_TYPE`: 切割模型类型 (`local`/`openai`/`anthropic`)

### 3. 初始化数据库

确保 PostgreSQL 已安装 pgvector 扩展：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

运行数据库迁移：

```bash
pnpm db:migrate
```

### 4. 启动 Ollama

确保 Ollama 服务运行并下载所需模型：

```bash
# 启动 Ollama
ollama serve

# 下载嵌入模型
ollama pull bge-m3

# 下载切割模型（如果使用本地模式）
ollama pull mistral:7b
```

### 5. 启动开发服务器

```bash
pnpm dev
```

访问：
- 应用首页: http://localhost:3000
- API 文档: http://localhost:3000/api/docs

## API 端点

所有 API 端点前缀为 `/api/kb`：

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/kb/ingest` | POST | 知识入库 |
| `/api/kb/search` | POST | 语义检索 |
| `/api/kb/list` | POST | 列表浏览 |
| `/api/kb/delete` | POST | 单条删除 |
| `/api/kb/stats` | POST | 统计概览 |

详细 API 文档请访问 `/api/docs`。

## 项目结构

```
postmem/
├── prisma/
│   └── schema.prisma          # 数据库模式定义
├── public/
│   └── swagger.json           # OpenAPI 规范
├── src/
│   ├── lib/
│   │   ├── container.ts       # 依赖注入容器
│   │   ├── errors.ts          # 错误定义
│   │   └── prisma.ts          # Prisma 客户端
│   ├── services/
│   │   ├── embedding.service.ts    # 嵌入服务
│   │   ├── chunk.service.ts        # 切割服务
│   │   ├── cut-model.service.ts    # 切割模型服务
│   │   └── kb.service.ts           # 知识库核心服务
│   └── types/
│       └── index.ts           # 类型定义
├── pages/
│   ├── api/
│   │   ├── kb/
│   │   │   ├── ingest.ts      # 入库接口
│   │   │   ├── search.ts      # 检索接口
│   │   │   ├── list.ts        # 列表接口
│   │   │   ├── delete.ts      # 删除接口
│   │   │   └── stats.ts       # 统计接口
│   │   └── docs.tsx           # Swagger UI
│   └── index.tsx              # 首页
└── package.json
```

## 配置说明

### 嵌入模型配置

嵌入模型固定使用 Ollama + bge-m3，确保数据隐私：

```env
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=bge-m3
```

### 切割模型配置

支持三种模式：

**本地模式（推荐）**：
```env
CHUNK_MODEL_TYPE=local
CHUNK_MODEL_NAME=mistral:7b
```

**OpenAI 模式**：
```env
CHUNK_MODEL_TYPE=openai
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini
```

**Anthropic 模式**：
```env
CHUNK_MODEL_TYPE=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

## 开发指南

### 数据库操作

```bash
# 生成 Prisma 客户端
pnpm db:generate

# 创建迁移
pnpm db:migrate

# 部署迁移（生产环境）
pnpm db:deploy

# 打开 Prisma Studio
pnpm db:studio
```

### 代码规范

项目使用 TypeScript 严格模式，确保类型安全。

## 许可证

MIT
