#!/bin/bash

# API 测试脚本
# 用于测试所有 API 端点

set -e

BASE_URL="${1:-http://localhost:3000}"
PROJECT="test-api-$(date +%s)"

echo "🧪 PostMem API 测试"
echo "==================="
echo "Base URL: $BASE_URL"
echo "Test Project: $PROJECT"
echo ""

# 1. 测试入库
echo "1️⃣  测试知识入库..."
INGEST_RESPONSE=$(curl -s -X POST "$BASE_URL/api/kb/ingest" \
  -H "Content-Type: application/json" \
  -d "{
    \"project\": \"$PROJECT\",
    \"content\": \"向量数据库是一种专门用于存储和检索高维向量的数据库系统。它支持高效的相似度搜索，广泛应用于推荐系统、图像检索和自然语言处理等领域。PostgreSQL 的 pgvector 扩展提供了向量存储和检索功能。它支持多种距离度量方式，包括欧几里得距离、内积和余弦相似度。嵌入模型是将文本转换为向量的关键组件。bge-m3 是一个强大的开源嵌入模型，支持多语言和长文本处理。\"
  }")

echo "$INGEST_RESPONSE" | jq .
FIRST_ID=$(echo "$INGEST_RESPONSE" | jq -r '.data.ids[0]')
echo ""

# 2. 测试检索
echo "2️⃣  测试语义检索..."
curl -s -X POST "$BASE_URL/api/kb/search" \
  -H "Content-Type: application/json" \
  -d "{
    \"project\": \"$PROJECT\",
    \"query\": \"什么是向量数据库\",
    \"top_k\": 3,
    \"context_window\": 1
  }" | jq .
echo ""

# 3. 测试列表
echo "3️⃣  测试列表浏览..."
curl -s -X POST "$BASE_URL/api/kb/list" \
  -H "Content-Type: application/json" \
  -d "{
    \"project\": \"$PROJECT\",
    \"page\": 1,
    \"limit\": 10
  }" | jq .
echo ""

# 4. 测试统计
echo "4️⃣  测试统计概览..."
curl -s -X POST "$BASE_URL/api/kb/stats" \
  -H "Content-Type: application/json" \
  -d "{
    \"project\": \"$PROJECT\"
  }" | jq .
echo ""

# 5. 测试删除
if [ "$FIRST_ID" != "null" ] && [ -n "$FIRST_ID" ]; then
  echo "5️⃣  测试单条删除 (ID: $FIRST_ID)..."
  curl -s -X POST "$BASE_URL/api/kb/delete" \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": $FIRST_ID
    }" | jq .
  echo ""
fi

# 6. 测试所有项目统计
echo "6️⃣  测试所有项目统计..."
curl -s -X POST "$BASE_URL/api/kb/stats" \
  -H "Content-Type: application/json" \
  -d "{}" | jq .
echo ""

echo "✅ API 测试完成!"
