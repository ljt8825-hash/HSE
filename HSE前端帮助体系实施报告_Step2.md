# HSE 前端帮助体系实施报告 — Step 2/3

**日期：** 2026-07-27
**实施阶段：** 数据写入 + 页面集成
**完成状态：** ✅ 全部完成

---

## 一、写入的帮助内容清单

通过 `server/_seed_help_data.js` 脚本向 `hse_business_help` 表成功写入 4 条帮助内容（已存在则自动跳过）：

| helpe_code | 标题 | 版本 | 状态 | 写入 ID |
|-----------|------|------|------|--------|
| `HSE_DRIVER_RISK_CENTER` | 驾驶员风险中心帮助 | 1.0 | active | 42 |
| `HSE_ACCIDENT_LIST` | 事故分析中心帮助 | 1.0 | active | 43 |
| `HSE_ASSESSMENT_LIST` | 考核分析中心帮助 | 1.0 | active | 44 |
| `HSE_WARNING_LIST` | 预警与整改中心帮助 | 1.0 | active | 45 |

每条帮助内容均包含完整的 6 个标准字段：
- `content`（功能说明 + 操作流程 + 常见问题 ≥3 条）
- `field_description`（数据来源 + 更新周期，二级标题分开）
- `calculate_rule`（计算逻辑，含公式和等级划分）
- `relation_rule`（业务联动规则，含数据流转图）
- `permission_rule`（数据权限 + 功能权限矩阵表）
- `generate_rule`（空字符串，无自动生成规则）

---

## 二、修改的页面文件及改动说明

### 2.1 驾驶员风险中心

**文件：** `apps/web-antd/src/views/hse/driver-risk-center/index.vue`

**改动内容：**
- `<template #extra>`：用 `<Space size="8">` 包裹，前面新增 `<HelpButton menuCode="HSE_DRIVER_RISK_CENTER" />`，原有 `ImportButtonGroup` 在右侧
- `<script>`：新增 `Space` 从 `ant-design-vue` 导入，新增 `{ HelpButton }` 从 `#/components/hse` 导入

### 2.2 事故分析中心

**文件：** `apps/web-antd/src/views/hse/accident-analysis/index.vue`

**改动内容：**
- `<template #extra>`：用 `<Space size="8">` 包裹，前面新增 `<HelpButton menuCode="HSE_ACCIDENT_LIST" />`，原有 `ImportButtonGroup` 在右侧
- `<script>`：新增 `Space` 从 `ant-design-vue` 导入，新增 `{ HelpButton }` 从 `#/components/hse` 导入

### 2.3 考核分析中心

**文件：** `apps/web-antd/src/views/hse/assessment-analysis/index.vue`

**改动内容：**
- `<template #extra>`：在 `page-actions` 容器内新增 `<Space size="8">` 包裹所有元素，最前面加 `<HelpButton menuCode="HSE_ASSESSMENT_LIST" />`，后面保留原有 2 个 `a-select` + 1 个 `a-button`
- `<script>`：新增 `Space` 从 `ant-design-vue` 导入，新增 `{ HelpButton }` 从 `#/components/hse` 导入

### 2.4 预警与整改中心

**文件：** `apps/web-antd/src/views/hse/warning-center/index.vue`

**改动内容：**
- `<template #extra>`：用 `<Space size="8">` 包裹所有元素，最前面加 `<HelpButton menuCode="HSE_WARNING_LIST" />`，后面保留原有 `a-button`（扫描预警/新建规则，按 `activeTab` 切换显示）
- `<script>`：新增 `{ HelpButton }` 从 `#/components/hse` 导入（`Space` 已存在）

**统一设计原则：**
- HelpButton 始终放在 `extra` 区域**最左边**（帮助信息在前，操作按钮在后）
- 所有按钮/元素使用 `<Space size="8">` 水平排列，间距统一

---

## 三、seed 脚本路径和运行方式

**脚本路径：** `F:\hse-dashboard\server\_seed_help_data.js`

**运行方式：**
```bash
cd F:\hse-dashboard\server
node _seed_help_data.js
```

**脚本特性：**
- 直接使用项目数据库连接池（`config/db`），无需登录获取 token
- 自动检测已存在的 `menu_code`，存在则跳过，不重复插入
- 写入完成后自动查询并打印当前所有帮助内容列表
- 脚本为幂等设计，可重复运行

**运行输出示例：**
```
🚀 开始初始化 HSE 帮助内容数据...

✅  [HSE_DRIVER_RISK_CENTER] 驾驶员风险中心帮助 - 写入成功 (ID: 42)
✅  [HSE_ACCIDENT_LIST] 事故分析中心帮助 - 写入成功 (ID: 43)
✅  [HSE_ASSESSMENT_LIST] 考核分析中心帮助 - 写入成功 (ID: 44)
✅  [HSE_WARNING_LIST] 预警与整改中心帮助 - 写入成功 (ID: 45)

📊 验证写入结果...
当前共有 42 条帮助内容：
  - [HSE_DRIVER_RISK_CENTER] 驾驶员风险中心帮助 (active)
  - [HSE_ACCIDENT_LIST] 事故分析中心帮助 (active)
  - [HSE_ASSESSMENT_LIST] 考核分析中心帮助 (active)
  - [HSE_WARNING_LIST] 预警与整改中心帮助 (active)
  ...

🎉 HSE 帮助内容数据初始化完成！
```

---

## 四、浏览器验证结果

### 4.1 驾驶员风险中心（`/overview/driver-risk-center`）

| 验证项 | 结果 |
|--------|------|
| 页面右上角出现 `?` 圆形图标按钮 | ✅ 确认 |
| 悬浮显示 "帮助" tooltip | ✅ 确认 |
| 点击后右侧滑出 480px Drawer | ✅ 确认 |
| Drawer 标题为 "驾驶员风险中心帮助" | ✅ 确认 |
| 6 个可折叠 section 正常显示（功能说明/数据来源/计算逻辑/操作流程/关联规则/权限说明） | ✅ 确认 |
| 默认展开"功能说明"，Markdown 正确渲染（标题/列表/表格/代码块） | ✅ 确认 |
| 其他 section 点击可折叠展开 | ✅ 确认 |
| 关闭 Drawer（X按钮 + 点击遮罩）恢复正常 | ✅ 确认 |
| 控制台无报错 | ✅ 确认 |

### 4.2 事故分析中心（`/overview/accident-analysis`）

| 验证项 | 结果 |
|--------|------|
| 右上角 `?` 按钮 + "帮助" tooltip | ✅ 确认 |
| 点击打开 Drawer，标题 "事故分析中心帮助" | ✅ 确认 |
| 6 个 section 内容完整，Markdown 渲染正确 | ✅ 确认 |
| 控制台无报错 | ✅ 确认 |

### 4.3 考核分析中心（`/assessment/analysis`）

| 验证项 | 结果 |
|--------|------|
| 右上角 `?` 按钮 + "帮助" tooltip | ✅ 确认 |
| 部门选择框、周期选择框、导出按钮在帮助按钮右侧，布局正常 | ✅ 确认 |
| 点击打开 Drawer，标题 "考核分析中心帮助" | ✅ 确认 |
| 6 个 section 内容完整，Markdown 渲染正确 | ✅ 确认 |
| 控制台无报错 | ✅ 确认 |

### 4.4 预警与整改中心（`/warning/center`）

| 验证项 | 结果 |
|--------|------|
| 右上角 `?` 按钮 + "帮助" tooltip | ✅ 确认 |
| "扫描预警"/"新建规则" 按钮在帮助按钮右侧，布局正常 | ✅ 确认 |
| 切换 Tab 时按钮切换正常，HelpButton 始终可见 | ✅ 确认 |
| 点击打开 Drawer，标题 "预警与整改中心帮助" | ✅ 确认 |
| 6 个 section 内容完整，Markdown 渲染正确 | ✅ 确认 |
| 控制台无报错 | ✅ 确认 |

---

## 五、遗留问题或异常

### 5.1 已解决

| 问题 | 解决方式 |
|------|---------|
| 项目全局 `pnpm typecheck` 有大量已存在的 TS 错误（shadcn-ui、effects/layouts 等） | 与本次修改无关，已过滤验证：帮助相关文件 0 错误 ✅ |

### 5.2 无异常

本次 Step 2 所有操作执行顺利，没有发现新的异常或遗留问题。

---

## 六、Step 3 准备工作建议

Step 3 将完成帮助体系的收尾工作，建议按以下顺序进行：

1. **全量覆盖**：为剩余 HSE 模块补充帮助内容（风险中心、整改中心、隐患管理、培训管理、标准管理等）
2. **全局帮助中心入口**：在系统侧边栏或顶栏增加"帮助中心"总入口，支持搜索所有帮助文档
3. **帮助内容管理后台**：开发帮助内容的 CRUD 管理页面，支持运营人员维护
4. **版本管理**：支持帮助内容的版本切换和历史记录查看
5. **使用统计**：统计帮助内容的访问量、搜索关键词等，优化帮助内容质量
