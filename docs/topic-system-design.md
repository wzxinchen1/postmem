# Topic 主题系统设计文档

## 一、背景与问题

### 1.1 现有架构的问题

当前入库流程使用 `batchId` (UUID) 来标记一批次入库的记忆：

```
用户输入 → cutAndRewrite切分 → 生成 batchId = randomUUID() → 逐chunk去重入库
```

**核心缺陷**：
- `batchId` 无语义，无法反映内容本质
- 去重时 merge 操作可能跨 batch 执行，导致上下文错乱
- 无法追踪"这段记忆关于什么"
- 同一主题的内容被分散在不同 batch 中

### 1.2 解决方案

引入 **Topic 主题表**，由 LLM 在入库时生成有意义的主题名，替代无意义的 batchId。

---

## 二、核心原则

1. **每个 chunk 是独立的内容单元** — 无论来源（长文本/消息组），切分后各自独立走完整流程
2. **单次 LLM 决策** — 不做循环对话，一次请求直接返回结果
3. **偏向保守** — 宁可多建新主题，也不归入不匹配的已有主题
4. **写入即质量** — 数据质量在入库时保证，事后维护成本极高

---

## 三、数据模型

### 3.1 Topic 表

```prisma
model Topic {
  id          Int      @id @default(autoincrement())
  kbId        Int
  name        String   // LLM 生成的主题名（2-8词）
  description String   // LLM 生成的主题摘要（50字以内，概括该类内容的共同特征）

  kb          KnowledgeBase @relation(fields: [kbId], references: [id])
  memories    Memory[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**字段说明**：

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| name | String | LLM生成 | 简洁明确，如 "React Hooks最佳实践"、"PostgreSQL索引优化" |
| description | String | LLM生成 | 创建时一次性生成，作为后续匹配时的摘要展示 |

### 3.2 Memory 表变更

```prisma
model Memory {
  // ... 现有字段保持不变 ...

  topicId     Int?    // 新增：关联 Topic（替代 ingest_batch 的语义分组功能）
  topic       Topic?  @relation(fields: [topicId], references: [id])

  // 删除 ingest_batch 字段
  // 删除 chunk_index 字段（不再需要按批次定位）
}
```

**变更说明**：

- 新增 `topicId` 可选外键
- **删除** `ingest_batch` 字段
- **删除** `chunk_index` 字段（Topic 内不需要顺序索引）
- 历史数据直接清除，不做迁移

### 3.3 KnowledgeBase 表变更

```prisma
model KnowledgeBase {
  // ... 现有字段 ...
  
  topics   Topic[]     // 新增关联
}
```

---

## 四、入库完整流程

### 4.1 流程图

```
┌─────────────────────────────────────────────────────┐
│                    入库触发                           │
│         (POST /api/kb/ingest)                        │
│         body: { kbId, content } or { kbId, messages} │
└──────────────────────────┬──────────────────────────┘
                           ↓
              ┌────────────▼────────────┐
              │    ① 内容切分            │
              │  (保持现有逻辑不变)       │
              │  - ingestText:          │
              │    cutAndRewrite()       │
              │  - ingestMessages:       │
              │    格式化为 "角色: 内容"   │
              └────────────┬────────────┘
                           ↓
              生成 chunks: string[]
                           ↓
        ┌──────────────────▼──────────────────┐
        │  ② 对每个 chunk 独立执行以下流程：    │
        │                                      │
        │  ┌─────────────────────────────┐     │
        │  │ Step A: 主题匹配             │     │
        │  │  - 查询该 KB 所有 Topic      │     │
        │  │  - 调用 LLM 单次决策         │     │
        │  │  - 返回 select / create      │     │
        │  └─────────────┬───────────────┘     │
        │                ↓                      │
        │  ┌─────────────────────────────┐     │
        │  │ Step B: 处理结果             │     │
        │  │  - select → 使用已有 Topic   │     │
        │  │  - create → LLM生成主题信息   │     │
        │  │           → 写入 Topic 表     │     │
        │  └─────────────┬───────────────┘     │
        │                ↓                      │
        │  ┌─────────────────────────────┐     │
        │  │ Step C: 主题内去重           │     │
        │  │  - 搜索范围限定在 topicId    │     │
        │  │  - 调用 shouldIngestChunk()  │     │
        │  │  - skip / merge / insert     │     │
        │  └─────────────┬───────────────┘     │
        │                ↓                      │
        │  ┌─────────────────────────────┐     │
        │  │ Step D: 写入 Memory          │     │
        │  │  - 关联 topicId              │     │
        │  │  - 生成 embedding            │     │
        │  │  - 写入向量+全文搜索索引      │     │
        │  └─────────────────────────────┘     │
        └──────────────────┬──────────────────┘
                           ↓
              返回 { count, memoryIds }
```

### 4.2 Step A 详细：主题匹配

#### 输入准备

```typescript
// 1. 查询该知识库的所有 Topic
const topics = await prisma.topic.findMany({
  where: { kbId },
  select: { id: true, name: true, description: true },
})

// 2. 组装 prompt 输入
const input = {
  content: chunk,
  topics: topics.map(t => ({
    name: t.name,
    description: t.description,
  })),
  isEmpty: topics.length === 0,
}
```

#### LLM 调用（单次）

**Prompt 模板**：

```
你是知识库的主题分类助手。

## 任务
判断当前内容应该归入已有主题还是需要创建新主题。

## 当前内容
{content}

## 已有主题列表
{topics 为空时显示："暂无主题"}
{topics 不为空时显示：}
{topics.map(t => `- ${t.name}: ${t.description}`).join('\n')}

## 判断规则
1. 如果当前内容与某个已有主题**明显相关**（讨论的是同一类事物），选择该主题
2. 如果与所有已有主题都**不相关**，或者你**无法确定**归属 → 创建新主题
3. **宁可多建一个新主题，也不要归到错误的主题下**
4. 不要犹豫，直接做出判断

## 返回格式（严格 JSON）
{
  "action": "select",
  "topicName": "选中的主题名（必须与已有主题名完全一致）",
  "reason": "简短理由"
}

或

{
  "action": "create",
  "reason": "为什么需要创建新主题"
}

注意：只返回 JSON，不要包含其他内容。
```

#### 解析结果

```typescript
interface TopicMatchResult {
  action: 'select' | 'create'
  topicName?: string  // action === select 时必填
  reason: string
}
```

### 4.3 Step B 详细：处理匹配结果

#### 场景一：select（使用已有主题）

```typescript
if (result.action === 'select') {
  const topic = await prisma.topic.findFirst({
    where: {
      kbId,
      name: result.topicName,  // 精确匹配
    },
  })

  if (!topic) {
    throw Errors.badRequest(`主题 "${result.topicName}" 不存在`)
  }

  return topic.id
}
```

**安全处理**：
- 如果 LLM 返回的主题名不存在于数据库 → 抛错或降级为 create

#### 场景二：create（创建新主题）

需要第二次 LLM 调用，生成完整的主题信息：

**Prompt 模板**：

```
基于以下内容，为知识库创建一个新主题。

## 内容
{content}

## 要求
为主题命名并撰写摘要。

返回 JSON：
{
  "name": "主题名称（2-8个词，简洁明了，如'React Hooks最佳实践'）",
  "description": "主题摘要（50字以内，概括这类内容的共同特征，用于后续判断其他内容是否属于此主题）"
}

只返回 JSON。
```

**写入数据库**：

```typescript
const newTopic = await prisma.topic.create({
  data: {
    kbId,
    name: createResult.name,
    description: createResult.description,
  },
})
return newTopic.id
```

### 4.4 Step C 详细：主题内去重

#### 关键变化

```diff
- // 旧逻辑：在整个知识库范围内搜索相似记忆
- const similarMemories = await this.search(kbId, chunk, topK=3)

+ // 新逻辑：仅在选定主题范围内搜索相似记忆
+ const similarMemories = await this.searchInTopic(kbId, topicId, chunk, topK=3)
```

**新增方法**：

```typescript
async searchInTopic(
  kbId: number,
  topicId: number,
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  // 复用现有 search 逻辑，但增加 WHERE topicId = ${topicId}
  // Dense + Sparse + RRF 流程保持不变
}
```

#### 去重判断（保持现有逻辑）

```typescript
if (similarMemories.length === 0) {
  // 无相似记忆 → 直接 insert
  return 'insert'
}

// 有相似记忆 → LLM 判断
const result = await this.cutModelService.shouldIngestChunk(
  chunk,
  similarMemories.map(m => ({ id: m.id, content: m.content, score: m.score })),
  kbId
)

// result.action: 'skip' | 'merge' | 'insert'
```

### 4.5 Step D 详细：写入 Memory

```diff
- await this.prisma.$executeRaw`
-   INSERT INTO memories (
-     kb_id, content, embedding, chunk_index, ingest_batch, 
-     metadata, "contentTsvector", created_at
-   ) VALUES (
-     ${kbId}, ${chunk}, ${embedding}, ${actualIndex}, ${batchId},
-     ${metadata}, to_tsvector('simple', ${chunk}), NOW()
-   )
- `
+ await this.prisma.memory.create({
+   data: {
+     kbId,
+     topicId,
+     content: chunk,
+     embedding,
+     metadata,
+     contentTsvector: `to_tsvector('simple', ${chunk})`,
+   },
+ })
```

---

## 五、服务层改造

### 5.1 新增方法清单

#### CutModelService（src/services/cut-model.service.ts）

```typescript
/**
 * 主题匹配：判断内容应归入哪个主题
 */
async matchTopic(
  content: string,
  existingTopics: Array<{ name: string; description: string }>
): Promise<TopicMatchResult>

/**
 * 主题创建：为新内容生成主题名和摘要
 */
async createTopicInfo(content: string): Promise<{
  name: string
  description: string
}>
```

#### KBService（src/services/kb.service.ts）

```typescript
/**
 * 主题内搜索（新增）
 * 与 search() 类似，但 WHERE 条件增加 topicId 过滤
 */
async searchInTopic(
  kbId: number,
  topicId: number,
  query: string,
  topK?: number
): Promise<SearchResult[]>
```

### 5.2 改造方法

#### ingestText()

```typescript
async ingestText(kbId: number, content: string): Promise<IngestTextResponse> {
  // ① 校验（保持不变）
  // ② 验证知识库存在（保持不变）
  // ③ 切分（保持不变）
  //    const chunks = await this.cutModelService.cutAndRewrite(content, kbId)

  const memoryIds: number[] = []

  for (const chunk of chunks) {
    // ④ ★ 新增：主题匹配
    const topicId = await this.resolveTopic(kbId, chunk)

    // ⑤ 改造：主题内去重
    const similarMemories = await this.searchInTopic(kbId, topicId, chunk, 3)

    // ⑥ 去重判断（保持不变）
    // ⑦ 写入（关联 topicId）
  }

  return { count: memoryIds.length, memoryIds }
}
```

#### ingestMessages()

改造方式同上，唯一的区别是 chunk 的格式化方式不同。

### 5.3 新增私有方法

```typescript
/**
 * 解析/创建主题，返回 topicId
 * 封装了 matchTopic + createTopicInfo 的完整流程
 */
private async resolveTopic(kbId: number, content: string): Promise<number> {
  // 1. 查询已有主题
  // 2. 调用 matchTopic
  // 3. 根据 action 处理
  // 4. 返回 topicId
}
```

---

## 六、Prompt 设计汇总

### 6.1 文件位置

所有 prompt 模板统一放在 `src/lib/prompts.ts`

### 6.2 新增 Prompt 常量

| 常量名 | 用途 |
|--------|------|
| `TOPIC_MATCH_SYSTEM_PROMPT` | 主题匹配的系统提示词 |
| `TOPIC_CREATE_PROMPT` | 创建新主题的提示词 |

### 6.3 现有 Prompt 变更

无需修改现有的 cut/rewrite/dedup prompt，它们与主题系统独立。

---

## 七、API 层影响

### 7.1 接口签名变化

**无变化**。

外部接口 `POST /api/kb/ingest` 保持不变，内部实现自动处理主题逻辑。

### 7.2 响应格式变化

可选增强：

```typescript
// 当前响应
interface IngestTextResponse {
  count: number
  memoryIds: number[]
}

// 可选增强（便于前端展示）
interface IngestTextResponse {
  count: number
  memoryIds: number[]
  topicsInvolved?: string[]  // 涉及的主题名列表
}
```

---

## 八、测试策略

### 8.1 单元测试

| 测试场景 | 验证点 |
|----------|--------|
| 空 Topic 列表时入库 | 自动创建新主题 |
| 有匹配主题时 | 正确选择已有主题 |
| 主题名不存在时 | 降级为创建新主题 |
| 主题内去重 | 只在同主题内搜索相似记忆 |
| 跨主题不误合并 | 不同主题的记忆不会被 merge |

### 8.2 集成测试

- 完整入库流程端到端测试
- 多 chunk 分别归入不同主题的场景

---

## 九、迁移步骤

### 9.1 数据库迁移

```bash
# 用户手动执行
pnpm prisma migrate dev --name add_topic_table
```

迁移内容：
1. 创建 `Topic` 表
2. `Memory` 表新增 `topicId` 外键
3. 删除 `Memory.ingest_batch` 字段
4. 删除 `Memory.chunk_index` 字段
5. 清空 `Memory` 表历史数据

### 9.2 代码部署顺序

1. 更新 schema + 生成 Prisma Client
2. 添加 prompt 模板
3. 实现 CutModelService 新方法
4. 实现 KBService.resolveTopic + searchInTopic
5. 改造 ingestText / ingestMessages
6. 测试验证

---

## 十、边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 数据库无任何 Topic | LLM 直接进入 create 分支 |
| LLM 返回的主题名不存在 | 降级为 create |
| 同一内容多次入库 | 第一次创建 Topic，后续匹配到同一 Topic |
| 超长文本切成多个不同主题的 chunk | 每个 chunk 独立匹配，自然分散到不同 Topic |
| Topic 数量过多（100+） | 全部传入 LLM（现代模型上下文足够） |

---

## 十一、未来扩展方向（本次不实现）

- Topic 合并：检测语义相近的 Topic 并提供合并建议
- Topic 层级：支持父子主题关系
- Topic 统计面板：展示各 Topic 的记忆数量、最后更新时间等
