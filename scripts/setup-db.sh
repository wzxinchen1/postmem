#!/bin/bash

# 开发环境快速启动脚本

set -e

echo "🚀 PostMem 开发环境设置"
echo "========================"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
  echo "❌ pnpm 未安装，请先安装 pnpm"
  echo "   npm install -g pnpm"
  exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js 未安装"
  exit 1
fi

echo "✅ Node.js $(node -v)"
echo "✅ pnpm $(pnpm -v)"

# 安装依赖
echo ""
echo "📦 安装依赖..."
pnpm install

# 检查环境变量
if [ ! -f .env ]; then
  echo ""
  echo "⚠️  .env 文件不存在，从 .env.example 复制..."
  cp .env.example .env
  echo "✅ 已创建 .env 文件，请根据需要修改配置"
fi

# 生成 Prisma 客户端
echo ""
echo "🔧 生成 Prisma 客户端..."
pnpm db:generate

echo ""
echo "✅ 设置完成!"
echo ""
echo "下一步："
echo "1. 确保 PostgreSQL 数据库运行并已创建 pgvector 扩展"
echo "2. 修改 .env 文件中的 DATABASE_URL"
echo "3. 运行数据库迁移: pnpm db:migrate"
echo "4. 启动 Ollama 服务: ollama serve"
echo "5. 下载所需模型: ollama pull bge-m3 && ollama pull mistral:7b"
echo "6. 启动开发服务器: pnpm dev"
echo ""
