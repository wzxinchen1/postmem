# 数据库迁移说明

## 快速开始

```bash
# 一键设置数据库（推荐）
pnpm db:setup

# 这个命令会：
# 1. 生成 Prisma 客户端
# 2. 运行所有迁移
# 3. 插入种子数据
```

## 迁移流程

所有数据库变更必须遵循以下流程：

1. **修改 Schema**: 编辑 `prisma/schema.prisma`
2. **生成迁移**: 运行 `pnpm db:migrate` (开发环境)
3. **检查 SQL**: 查看生成的迁移文件
4. **提交代码**: 提交 schema 和迁移文件

## 可用命令

```bash
pnpm db:generate   # 生成 Prisma 客户端
pnpm db:migrate    # 运行迁移（开发环境）
pnpm db:deploy     # 运行迁移（生产环境）
pnpm db:seed       # 插入种子数据
pnpm db:setup      # 一键设置（generate + deploy + seed）
pnpm db:studio     # 打开数据库管理界面
```

## 禁止事项

- ❌ 使用 `psql` 命令直接执行 SQL
- ❌ 手动创建 `.sql` 文件执行数据库变更
- ❌ 跳过 Prisma 直接修改数据库

## 文件说明

- `schema.prisma` - 数据库模型定义
- `migrations/` - Prisma 自动生成的迁移文件
- `seed.ts` - 种子数据脚本（使用 Prisma 客户端）
