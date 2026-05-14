# Admin 模块重构说明

## 目录结构

```
app/admin/
├── page.tsx                 # 主页面组件(已精简)
├── types.ts                 # 类型定义
├── constants.ts             # 常量定义(颜色、菜单项等)
├── index.ts                 # 主导出文件
├── README.md                # 本文档
│
├── components/              # 组件目录
│   ├── index.ts            # 组件导出索引
│   ├── Message.tsx         # 消息提示组件
│   ├── TabSelector.tsx     # Tab 选择器组件
│   ├── KBSelector.tsx      # 知识库选择器组件
│   │
│   ├── modals/             # 模态窗口组件
│   │   ├── CreateKBModal.tsx    # 创建知识库模态窗口
│   │   └── IngestModal.tsx      # 入库模态窗口
│   │
│   └── tabs/               # Tab 页面组件
│       ├── IngestTab.tsx   # 知识库管理 Tab
│       ├── SearchTab.tsx   # 语义检索 Tab
│       ├── ListTab.tsx     # 列表管理 Tab
│       └── StatsTab.tsx    # 统计概览 Tab
│
└── hooks/                   # 自定义 Hooks
    ├── index.ts            # Hooks 导出索引
    └── useMessage.ts       # 消息提示 Hook
```

## 重构改进

### 1. 模块化拆分
- **类型定义** (`types.ts`): 集中管理所有 TypeScript 类型
- **常量定义** (`constants.ts`): 统一管理样式常量和配置
- **组件拆分**: 按功能模块拆分为独立组件

### 2. 组件层次
- **基础组件**: Message, TabSelector, KBSelector
- **模态窗口**: CreateKBModal, IngestModal
- **功能 Tab**: IngestTab, SearchTab, ListTab, StatsTab

### 3. 自定义 Hooks
- `useMessage`: 统一管理消息提示状态

### 4. 代码复用
- 公共样式通过 `COLORS` 常量复用
- 消息提示逻辑通过 `useMessage` Hook 复用
- 模态窗口逻辑独立封装

### 5. 可维护性提升
- 单一职责原则: 每个组件只负责一个功能
- 清晰的目录结构: 便于查找和维护
- 类型安全: 完整的 TypeScript 类型定义

## 使用方式

```tsx
import { IngestTab, SearchTab, ListTab, StatsTab } from './components'
import { useMessage } from './hooks'
import { COLORS, MENU_ITEMS } from './constants'
import type { StatsResponse, SearchResponse } from './types'
```

## 功能模块

### 1. 知识库管理 (IngestTab)
- 知识库列表展示
- 创建新知识库
- 知识入库操作

### 2. 语义检索 (SearchTab)
- 查询语句输入
- 参数配置 (top_k, context_window)
- 检索结果展示

### 3. 列表管理 (ListTab)
- 分页列表展示
- 删除操作
- 分页导航

### 4. 统计概览 (StatsTab)
- 统计卡片展示
- 知识库详情列表

## 优势

1. **代码可读性**: 每个文件职责清晰,易于理解
2. **可维护性**: 修改某个功能只需修改对应模块
3. **可测试性**: 独立组件易于单元测试
4. **可扩展性**: 新增功能只需添加新模块
5. **团队协作**: 不同开发者可以并行开发不同模块