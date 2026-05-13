# 字段重命名日志

## 更改概述
将 `project` 字段重命名为 `kbName`（知识库名），使术语更加准确和语义化。

## 数据库更改

### Schema 更新
- 文件: `prisma/schema.prisma`
- 更改: `project` → `kbName`，映射到数据库列名 `kb_name`

### 迁移文件
- 新增: `prisma/migrations/20260513000000_rename_project_to_kbname.sql`
- 操作:
  - 重命名列: `project` → `kb_name`
  - 删除旧索引: `memories_project_idx`
  - 创建新索引: `memories_kb_name_idx`

## 代码更改

### 类型定义
- 文件: `src/types/index.ts`
- 所有接口中的 `project` 字段改为 `kbName`

### 服务层
- 文件: `src/services/kb.service.ts`
- 所有方法参数和数据库查询中的 `project` 改为 `kbName`
- 错误消息更新为"知识库名"

### 错误处理
- 文件: `src/lib/errors.ts`
- 错误码: `PROJECT_NOT_FOUND` → `KB_NOT_FOUND`
- 错误消息: "项目" → "知识库"

### API 端点
- 文件: `pages/api/kb/*.ts`
- 所有API中的字段验证和参数从 `project` 改为 `kbName`

### UI 界面
- 文件: `pages/dashboard.tsx`
- 所有UI标签从"项目名称"改为"知识库名"
- 所有变量和API调用从 `project` 改为 `kbName`

### API 文档
- 文件: `public/swagger.json`
- 所有字段定义和示例从 `project` 改为 `kbName`
- 所有描述文本从"项目"改为"知识库"

## 测试脚本更新
- 文件: `scripts/test-api.sh`
- 需要手动更新测试脚本中的字段名（未包含在此次更改中）

## 部署步骤

1. **备份数据库**（重要！）
   ```bash
   pg_dump -U <user> -d <database> > backup.sql
   ```

2. **运行迁移**
   ```bash
   pnpm db:deploy
   ```

3. **重启应用**
   ```bash
   pnpm build
   pnpm start
   ```

## 向后兼容性

⚠️ **此更改不向后兼容**

- 所有使用 `project` 字段的API请求需要更新为 `kbName`
- 客户端代码需要相应更新
- 建议在部署前通知所有API使用者

## 影响范围

### API 端点
- `POST /api/kb/ingest` - 请求体字段: `project` → `kbName`
- `POST /api/kb/search` - 请求体字段: `project` → `kbName`
- `POST /api/kb/list` - 请求体字段: `project` → `kbName`
- `POST /api/kb/stats` - 请求体字段: `project` → `kbName`（可选）

### 数据库
- 表 `memories` 列 `project` 重命名为 `kb_name`
- 索引重命名

## 验证清单

- [x] Prisma schema 更新
- [x] 类型定义更新
- [x] 服务层代码更新
- [x] API 端点更新
- [x] UI 界面更新
- [x] API 文档更新
- [x] 错误处理更新
- [x] Prisma 客户端生成
- [ ] 数据库迁移执行（需要手动执行）
- [ ] 测试脚本更新（需要手动执行）
- [ ] 集成测试（建议执行）

## 新的 API 示例

### 入库请求
```json
{
  "kbName": "my-knowledge-base",
  "content": "要存储的文本内容..."
}
```

### 检索请求
```json
{
  "kbName": "my-knowledge-base",
  "query": "搜索查询",
  "top_k": 5,
  "context_window": 1
}
```

### 统计请求
```json
{
  "kbName": "my-knowledge-base"  // 可选，不提供则返回所有知识库统计
}
```
