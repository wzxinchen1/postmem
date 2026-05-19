#!/bin/bash
# 测试硅基流动 Kimi 识图速度
# 用法: ./scripts/test-vision.sh [图片路径]
# 不传参数则使用 1x1 小图作为基线

set -e

API_KEY="sk-iigwxwybfdbwljsisxkqqeqqkgkboszlgbywohjmaytyzrnz"
BASE_URL="https://api.siliconflow.cn/v1"
MODEL="Pro/moonshotai/Kimi-K2.6"

if [ -n "$1" ]; then
  echo "使用图片: $1"
  BASE64=$(base64 -w0 "$1")
  MIME=$(file --mime-type -b "$1")
  SIZE=$(wc -c < "$1" | tr -d ' ')
  echo "图片大小: ${SIZE} bytes, MIME: ${MIME}"
else
  echo "未指定图片，使用 1x1 像素测试图"
  echo -n "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" | base64 -d > /tmp/test-1px-vision.png
  BASE64=$(base64 -w0 /tmp/test-1px-vision.png)
  MIME="image/png"
fi

echo ""
echo "===== 测试 1: 非流式 (stream=false) ====="
time curl -s -X POST "${BASE_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "{
    \"model\": \"${MODEL}\",
    \"messages\": [
      {
        \"role\": \"user\",
        \"content\": [
          {\"type\": \"text\", \"text\": \"请详细描述这张图片的内容\"},
          {\"type\": \"image_url\", \"image_url\": {\"url\": \"data:${MIME};base64,${BASE64}\"}}
        ]
      }
    ],
    \"stream\": false,
    \"thinking\": {}
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('识别结果长度:', len(d['choices'][0]['message']['content']), '字符'); print('token使用:', d.get('usage',{}))" 2>&1

echo ""
echo "===== 测试 2: 流式 (stream=true) ====="
time curl -s -X POST "${BASE_URL}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "{
    \"model\": \"${MODEL}\",
    \"messages\": [
      {
        \"role\": \"user\",
        \"content\": [
          {\"type\": \"text\", \"text\": \"请详细描述这张图片的内容\"},
          {\"type\": \"image_url\", \"image_url\": {\"url\": \"data:${MIME};base64,${BASE64}\"}}
        ]
      }
    ],
    \"stream\": true,
    \"thinking\": {}
  }" 2>&1 | head -c 2000

echo ""
echo "完成"
