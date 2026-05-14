# UI 设计规范

## 核心原则

**所有 UI 组件必须使用 React + Ant Design 实现，遵循 Ant Design 设计语言。**

---

## 技术栈

- UI 框架: React 18+
- 组件库: Ant Design 6.x
- 路由: Next.js 14 (App Router)

---

## 布局规范

### 1. 页面布局

使用 Ant Design 的 `Layout` 组件构建页面，标准结构为 `Header + Content`。

### 2. 菜单与标题同行（强制要求）

导航菜单必须与页面标题在同一行，使用 `Header` 组件的 `flex` 布局：

```tsx
<Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px' }}>
  <Title level={4} style={{ margin: 0, color: '#fff', marginRight: 24 }}>
    系统标题
  </Title>
  <Menu
    theme="dark"
    mode="horizontal"
    items={menuItems}
    style={{ flex: 1, minWidth: 0 }}
  />
</Header>
```

**关键点**:
- `Header` 使用 `display: flex` 和 `alignItems: center`
- 标题设置 `marginRight` 与菜单分隔
- 菜单设置 `flex: 1` 占据剩余空间
- 菜单模式必须为 `mode="horizontal"`

---

## 组件使用规范

### 1. 必须使用的 Ant Design 组件

- **布局**: Layout, Header, Content, Sider
- **导航**: Menu, Breadcrumb
- **数据展示**: Table, List, Card, Descriptions
- **表单**: Form, Input, Select, Button, Switch
- **反馈**: Message, Modal, notification
- **排版**: Typography (Title, Text, Paragraph)

### 2. 禁止的做法

- 禁止使用原生 HTML 元素替代 Ant Design 组件（如 `<div>` 替代 `<Card>`）
- 禁止自定义 CSS 覆盖 Ant Design 核心样式（主题色、间距等）
- 禁止使用其他 UI 组件库（如 Material-UI、Bootstrap）

---

## 样式规范

### 1. 内联样式优先

使用 `style` 属性设置样式，避免创建独立的 CSS 文件：

```tsx
<div style={{ padding: 24, background: '#f0f2f5' }}>
  <Card style={{ marginBottom: 16 }}>内容</Card>
</div>
```

### 2. 主题色

使用 Ant Design 默认主题色：
- 主色: `#1677ff` (蓝色)
- 成功: `#52c41a` (绿色)
- 警告: `#faad14` (橙色)
- 错误: `#ff4d4f` (红色)

### 3. 间距

使用 8px 基准间距系统：
- 小间距: 8px
- 中间距: 16px
- 大间距: 24px

---

## 响应式设计

### 1. 断点

使用 Ant Design 的 Grid 系统：
- `xs`: < 576px
- `sm`: ≥ 576px
- `md`: ≥ 768px
- `lg`: ≥ 992px
- `xl`: ≥ 1200px

### 2. 栅格布局

使用 `Row` 和 `Col` 组件：

```tsx
<Row gutter={[16, 16]}>
  <Col xs={24} sm={12} md={8} lg={6}>
    <Card>内容</Card>
  </Col>
</Row>
```

---

## 表单规范

### 1. 表单布局

使用 `Form` 组件的 `layout` 属性：
- 水平布局: `layout="horizontal"` (默认，适合标签+输入框)
- 垂直布局: `layout="vertical"` (适合移动端)
- 行内布局: `layout="inline"` (适合搜索栏)

### 2. 表单验证

使用 Ant Design 的表单验证规则：

```tsx
<Form.Item
  name="name"
  label="名称"
  rules={[{ required: true, message: '请输入名称' }]}
>
  <Input />
</Form.Item>
```

---

## 表格规范

### 1. 表格配置

使用 `Table` 组件：
- 分页: 设置 `pagination` 属性
- 排序: 设置 `sorter` 属性
- 筛选: 设置 `filters` 属性
- 加载状态: 设置 `loading` 属性

### 2. 列定义

```tsx
const columns = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
    width: 200,
  },
  {
    title: '操作',
    key: 'action',
    render: (_, record) => <Button type="link">编辑</Button>,
  },
]
```

---

## 消息提示规范

### 1. 消息级别

- `message.success`: 操作成功
- `message.error`: 系统错误、网络错误
- `message.info`: 业务异常、用户输入错误
- `message.warning`: 需要注意但不阻塞操作

### 2. 使用方式

```tsx
import { message } from 'antd'
const [msg, contextHolder] = message.useMessage()

// 在组件内使用
msg.success('操作成功')
```

---

## 图标使用

使用 `@ant-design/icons` 图标库：

```tsx
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'

<Button icon={<PlusOutlined />}>新增</Button>
```

---

## 禁止的做法

1. 禁止使用非 Ant Design 组件库
2. 禁止菜单与标题分行显示
3. 禁止覆盖 Ant Design 主题变量
4. 禁止使用内联 CSS 替代 Ant Design 组件
5. 禁止忽略响应式设计
