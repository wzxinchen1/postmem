# 路径别名配置说明

本项目使用 `@` 开头的绝对路径别名，替代相对路径导入。

## 配置

### TypeScript 配置 (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### 使用示例

**❌ 旧方式（相对路径）：**
```typescript
import { Errors } from '../lib/errors'
import type { ApiResponse } from '../../types'
```

**✅ 新方式（绝对路径）：**
```typescript
import { Errors } from '@/src/lib/errors'
import type { ApiResponse } from '@/src/types'
```

## 目录结构

```
postmem/
├── src/
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── errors.ts
│   │   ├── container.ts
│   │   └── api-utils.ts
│   ├── services/
│   │   ├── embedding.service.ts
│   │   ├── cut-model.service.ts
│   │   ├── chunk.service.ts
│   │   └── kb.service.ts
│   └── types/
│       └── index.ts
└── pages/
    └── api/
        └── kb/
            ├── ingest.ts
            ├── search.ts
            ├── list.ts
            ├── delete.ts
            └── stats.ts
```

## 导入规则

1. **项目内部模块**：使用 `@/src/...` 格式
   ```typescript
   import { Errors } from '@/src/lib/errors'
   import { KBService } from '@/src/services/kb.service'
   ```

2. **外部依赖**：保持原有导入方式
   ```typescript
   import { PrismaClient } from '@prisma/client'
   import { createContainer } from 'awilix'
   ```

## 优势

- ✅ 避免相对路径地狱 (`../../../`)
- ✅ 移动文件时无需修改导入路径
- ✅ 更清晰的代码结构
- ✅ IDE 自动补全支持更好
