# PostMem 部署指南

本文档详细说明如何部署 PostMem 个人知识库系统。

## 前置要求

### 1. PostgreSQL 18 + pgvector

确保 PostgreSQL 已安装并启用 pgvector 扩展：

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-18
sudo apt-get install postgresql-18-pgvector

# macOS (Homebrew)
brew install postgresql@18
brew install pgvector

# Docker
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  pgvector/pgvector:pg18
```

创建数据库和扩展：

```sql
CREATE DATABASE postmem;
\c postmem
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Ollama

安装并启动 Ollama 服务：

```bash
# Linux/macOS
curl -fsSL https://ollama.com/install.sh | sh

# 启动服务
ollama serve

# 下载所需模型
ollama pull bge-m3          # 嵌入模型（必需）
ollama pull mistral:7b      # 切割模型（可选，如果使用本地模式）
```

验证 Ollama 是否正常运行：

```bash
curl http://localhost:11434/api/tags
```

## 部署步骤

### 方式一：直接部署

#### 1. 克隆项目

```bash
git clone <repository-url>
cd postmem
```

#### 2. 安装依赖

```bash
pnpm install
```

#### 3. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置关键参数：

```env
# 数据库连接
DATABASE_URL="postgresql://user:password@localhost:5432/postmem?schema=public"

# Ollama 服务地址
OLLAMA_BASE_URL="http://localhost:11434"

# 嵌入模型（固定使用 bge-m3）
EMBEDDING_MODEL="bge-m3"

# 切割模型配置
CHUNK_MODEL_TYPE="local"           # local | openai | anthropic
CHUNK_MODEL_NAME="mistral:7b"      # 本地模型名称

# 如果使用云端切割模型
# CHUNK_MODEL_TYPE="openai"
# OPENAI_API_KEY="sk-xxx"
# OPENAI_MODEL="gpt-4o-mini"
```

#### 4. 初始化数据库

```bash
# 生成 Prisma 客户端
pnpm db:generate

# 运行数据库迁移
pnpm db:migrate

# (可选) 查看数据库状态
pnpm db:studio
```

#### 5. 启动服务

开发模式：

```bash
pnpm dev
```

生产模式：

```bash
# 构建
pnpm build

# 启动
pnpm start
```

### 方式二：Docker 部署

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg18
    container_name: postmem-postgres
    environment:
      POSTGRES_USER: postmem
      POSTGRES_PASSWORD: postmem123
      POSTGRES_DB: postmem
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postmem"]
      interval: 10s
      timeout: 5s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    container_name: postmem-ollama
    volumes:
      - ollama-data:/root/.ollama
    ports:
      - "11434:11434"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  app:
    build: .
    container_name: postmem-app
    environment:
      DATABASE_URL: postgresql://postmem:postmem123@postgres:5432/postmem?schema=public
      OLLAMA_BASE_URL: http://ollama:11434
      CHUNK_MODEL_TYPE: local
      CHUNK_MODEL_NAME: mistral:7b
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      ollama:
        condition: service_started

volumes:
  postgres-data:
  ollama-data:
```

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制项目文件
COPY . .

# 生成 Prisma 客户端
RUN pnpm db:generate

# 构建
RUN pnpm build

# 暴露端口
EXPOSE 3000

# 启动
CMD ["pnpm", "start"]
```

部署命令：

```bash
# 启动所有服务
docker-compose up -d

# 初始化数据库
docker-compose exec app pnpm db:migrate

# 下载 Ollama 模型
docker-compose exec ollama ollama pull bge-m3
docker-compose exec ollama ollama pull mistral:7b

# 查看日志
docker-compose logs -f app
```

## 验证部署

### 1. 检查服务状态

```bash
# 检查 API
curl http://localhost:3000/api/kb/stats -X POST -H "Content-Type: application/json" -d '{}'

# 检查 Ollama
curl http://localhost:11434/api/tags
```

### 2. 测试 API

使用提供的测试脚本：

```bash
chmod +x scripts/test-api.sh
./scripts/test-api.sh http://localhost:3000
```

或手动测试：

```bash
# 入库测试
curl -X POST http://localhost:3000/api/kb/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "project": "test",
    "content": "这是一段测试文本内容。"
  }'

# 检索测试
curl -X POST http://localhost:3000/api/kb/search \
  -H "Content-Type: application/json" \
  -d '{
    "project": "test",
    "query": "测试文本"
  }'
```

### 3. 查看 API 文档

访问 http://localhost:3000/api/docs 查看 Swagger UI。

## 性能优化

### 1. PostgreSQL 配置

编辑 `postgresql.conf`：

```conf
# 内存配置
shared_buffers = 256MB
effective_cache_size = 1GB

# 连接池
max_connections = 200

# pgvector 索引参数
# HNSW 索引已在迁移中创建，参数为 m=16, ef_construction=64
# 可根据数据规模调整
```

### 2. Ollama 配置

确保有足够的 GPU 内存或 CPU 资源：

```bash
# 查看模型信息
ollama show bge-m3

# 调整并发数
OLLAMA_NUM_PARALLEL=4 ollama serve
```

### 3. Next.js 配置

生产环境优化：

```javascript
// next.config.js
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  generateEtags: true,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma']
  }
}
```

## 监控与维护

### 1. 日志查看

```bash
# Next.js 日志
pnpm dev  # 开发模式会输出详细日志

# PostgreSQL 日志
tail -f /var/log/postgresql/postgresql-18-main.log

# Ollama 日志
journalctl -u ollama -f
```

### 2. 数据库维护

```bash
# 查看数据库状态
pnpm db:studio

# 备份数据库
pg_dump postmem > postmem_backup.sql

# 恢复数据库
psql postmem < postmem_backup.sql
```

### 3. 性能监控

```sql
-- 查看索引使用情况
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'memories';

-- 查看向量索引状态
SELECT * FROM pg_indexes WHERE tablename = 'memories';
```

## 故障排查

### 1. 嵌入模型错误

```bash
# 检查 Ollama 服务
curl http://localhost:11434/api/tags

# 检查模型是否已下载
ollama list

# 重新下载模型
ollama pull bge-m3
```

### 2. 数据库连接错误

```bash
# 检查 PostgreSQL 状态
pg_isready

# 检查连接字符串
echo $DATABASE_URL

# 测试连接
psql $DATABASE_URL -c "SELECT version();"
```

### 3. 切割模型错误

```bash
# 检查切割模型配置
cat .env | grep CHUNK

# 如果使用云端模型，检查 API Key
cat .env | grep API_KEY

# 测试切割模型
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral:7b",
    "prompt": "测试",
    "stream": false
  }'
```

## 安全建议

1. **数据库安全**：
   - 使用强密码
   - 限制网络访问（仅允许应用服务器连接）
   - 定期备份

2. **API 安全**：
   - 生产环境添加认证中间件
   - 使用 HTTPS
   - 限制请求频率

3. **环境变量**：
   - 不要将 `.env` 文件提交到版本控制
   - 生产环境使用密钥管理服务

## 扩展配置

### 使用云端切割模型

如果本地 GPU 资源有限，可以使用云端切割模型：

```env
# OpenAI
CHUNK_MODEL_TYPE=openai
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini

# Anthropic
CHUNK_MODEL_TYPE=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

注意：云端切割模型会将文本发送到第三方服务，请评估数据隐私风险。

### 自定义参数

```env
# 应用参数
MAX_CONTENT_LENGTH=20000      # 最大文本长度
DEFAULT_TOP_K=5               # 默认检索数量
DEFAULT_CONTEXT_WINDOW=1      # 默认上下文窗口
DEFAULT_PAGE_SIZE=20          # 默认分页大小
```

## 更新与迁移

```bash
# 更新代码
git pull

# 更新依赖
pnpm install

# 运行新迁移
pnpm db:migrate

# 重启服务
pnpm build && pnpm start
```

## 技术支持

遇到问题请查看：
- README.md - 项目概述和快速开始
- API 文档 - http://localhost:3000/api/docs
- GitHub Issues - 提交问题和反馈