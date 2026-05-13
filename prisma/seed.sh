#!/bin/bash

# 数据库设置脚本
# 用于初始化 PostgreSQL 和 pgvector 扩展

set -e

echo "开始数据库设置..."

# 检查环境变量
if [ -z "$DATABASE_URL" ]; then
  echo "错误: DATABASE_URL 环境变量未设置"
  exit 1
fi

# 创建 pgvector 扩展
echo "创建 pgvector 扩展..."
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 运行 Prisma 迁移
echo "运行 Prisma 迁移..."
pnpm db:deploy

echo "数据库设置完成!"
