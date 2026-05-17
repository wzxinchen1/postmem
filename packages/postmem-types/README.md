# postmem-types

PostMem API 的 TypeScript 类型定义包，供调用端直接安装使用。

## 安装

```bash
npm install -D postmem-types
# 或
pnpm add -D postmem-types
```

## 使用

```typescript
import type {
  ApiResponse,
  SearchResult,
  CreateKBRequest,
  KnowledgeBaseInfo,
  ModelType,
  SSEEvent,
} from 'postmem-types'

const res: ApiResponse<SearchResult[]> = await fetch('/api/kb/search', {
  method: 'POST',
  body: JSON.stringify({ kbId: 1, query: 'hello' }),
}).then(r => r.json())

if (res.success) {
  console.log(res.data)
}
```

## 从 OpenAPI 自动生成（可选）

如果需要从最新的 `swagger.json` 重新生成路径级别的类型：

```bash
cd packages/postmem-types
pnpm run generate
```

这会使用 `openapi-typescript` 从 `../../public/swagger.json` 生成 `dist/api.d.ts`，包含所有路径和操作的类型映射。

## 发布

```bash
cd packages/postmem-types
pnpm publish
```

## 类型概览

| 分类 | 类型 |
|------|------|
| 枚举 | `ModelType`, `ConversationStatus`, `MessageRole`, `SearchSource`, `ErrorCode`, `SSEEventType` |
| 通用 | `ApiResponse<T>`, `ApiError`, `ErrorResponse`, `SSEEvent<T>` |
| 知识库 | `CreateKBRequest`, `KnowledgeBaseInfo`, `SearchRequest`, `SearchResult`, `ListRequest`, `ListItem`, `IngestTextRequest`, `IngestMessagesRequest`, `IngestTextResponse` |
| 厂商 | `Vendor`, `CreateVendorRequest`, `UpdateVendorRequest` |
| 提供商 | `Provider`, `CreateProviderRequest`, `UpdateProviderRequest`, `ProviderTreeNode`, `ModelTreeNode` |
| 模型 | `Model`, `CreateModelRequest`, `UpdateModelRequest` |
| 对话 | `Conversation`, `ChatMessage`, `ChatCompletionRequest`, `ChatMessageInput`, `ChatCompletionResponse` |
| 设置 | `AppSettings`, `Stats` |
