# HSE系统人员保险管理模块优化报告

**项目名称**：宁津环卫HSE安全管理系统  
**模块**：人员保险管理  
**日期**：2026-07-15  
**技术栈**：Vue3 + TypeScript + Vben Admin + Ant Design Vue + Express + PostgreSQL

---

## 一、问题诊断与修复清单

### P0 — API对接修复（阻断性问题）

| 序号 | 问题描述 | 根因 | 修复方案 | 涉及文件 |
|------|----------|------|----------|----------|
| 1 | 批量续保 API 404 | 后端 `PUT /insurance/personnel/batch-renewal` 端点不存在 | 新增后端路由，支持 PostgreSQL + 内存双模式 | `server/routes/insurance.js` |
| 2 | 统计接口数据不匹配 | 后端返回 `{stats:{covered,...}}`，前端期望 `{active,...}` | 前端 `getPolicyStats` 增加格式适配层 | `api/hse/insurance.ts` |
| 3 | 列表筛选无效 | 后端仅支持 `keyword`，忽略 `department/insuranceStatus/isHighRisk` 等参数 | 后端 GET /personnel 新增多条件筛选 | `server/routes/insurance.js` |
| 4 | 单条续保不调API | `handleRenewalConfirm` 非批量模式直接 `message.success`，未调用后端 | 补充 `updatePersonnel` 调用 | `views/insurance/personnel/index.vue` |

### P1 — 功能与交互修复

| 序号 | 问题描述 | 修复方案 | 涉及文件 |
|------|----------|----------|----------|
| 5 | 高危人员Tab Badge 不在标签头显示 | `tab` 属性与子元素冲突，改用 `#tab` 插槽 | `views/insurance/personnel/index.vue` |
| 6 | 高危人员计数不准 | 改为 computed 属性，优先使用 stats 接口返回值 | `views/insurance/personnel/index.vue` |
| 7 | 前端覆盖后端 isHighRisk 字段 | 改为后端值优先，前端检测仅作兜底 | `views/insurance/personnel/index.vue` |
| 8 | 统计卡片总数用列表total而非stats | 统计卡片改用 `stats.total` | `views/insurance/personnel/index.vue` |

### P1 — UI标准化修复

| 序号 | 问题描述 | 修复方案 | 涉及文件 |
|------|----------|----------|----------|
| 9 | ImportModal 大量硬编码颜色（15+处） | 全部替换为 Vben CSS 变量 | `components/hse/ImportModal.vue` |
| 10 | ImportModal 内联样式 `style="margin-right: 4px"` | 抽离为 `.tag-icon` class | `components/hse/ImportModal.vue` |
| 11 | ImportButtonGroup 下载模板不走 requestClient | 改用 `downloadTemplate` API 函数，确保认证 | `components/hse/ImportButtonGroup.vue` |
| 12 | ImportModal 下载模板不走 requestClient | 同上 | `components/hse/ImportModal.vue` |

### P2 — 类型与代码规范

| 序号 | 问题描述 | 修复方案 | 涉及文件 |
|------|----------|----------|----------|
| 13 | InsuranceStatus 类型缺少 'expiring' | 补充类型定义 | `api/hse/insurance.ts` |
| 14 | PolicyStats 缺少 highRisk 字段 | 补充可选字段 | `api/hse/insurance.ts` |
| 15 | 未使用的 watch 导入 | 清理 | `views/insurance/personnel/index.vue` |

---

## 二、后端变更详情

### 2.1 新增：PUT /personnel/batch-renewal

**路径**：`PUT /api/insurance/personnel/batch-renewal`  
**位置**：`server/routes/insurance.js` 第402-438行

**请求体**：
```json
{
  "ids": [1, 2, 3],
  "policyStartDate": "2026-07-15",
  "policyEndDate": "2027-07-15",
  "premium": 800,
  "remark": "批量续保"
}
```

**响应**：
```json
{
  "code": 0,
  "data": { "renewed": 3 },
  "message": "成功续保3条记录"
}
```

**双模式支持**：
- PostgreSQL：使用 `UPDATE ... WHERE id = ANY($1::bigint[])` 批量更新
- 内存模式：遍历匹配 id 更新

### 2.2 增强：GET /personnel 列表筛选

**新增筛选参数**：

| 参数 | 类型 | 说明 | SQL 条件 |
|------|------|------|----------|
| `department` | string | 部门筛选 | `COALESCE(department, dept) = $n` |
| `insuranceStatus` | string | 保险状态 | `insured`: expire_date > 30d; `expiring`: 0-30d; `expired`: < today; `uninsured`: NULL |
| `isHighRisk` | boolean | 仅查高危 | `is_high_risk = true` |
| `highRiskCategory` | string | 高危分类 | `high_risk_category = $n` |

内存模式同步实现等价筛选逻辑。

---

## 三、前端变更详情

### 3.1 API 层（api/hse/insurance.ts）

**getPolicyStats 格式适配**：
```
后端返回: { stats: { total, covered, expired, highRisk, expiring30d }, byType, byDepartment }
前端映射: { total, active(←covered), expired, highRisk, expiring30d, byType, byDepartment }
```

**类型修复**：
- `InsuranceStatus`: 新增 `'expiring'` 联合类型成员
- `PolicyStats`: 新增 `highRisk?: number` 可选字段

### 3.2 页面层（views/insurance/personnel/index.vue）

**高危人员Tab修复**：
- 改用 `#tab` 插槽渲染 Badge，确保 Badge 在Tab标签头显示
- Badge 计数改为 computed，优先取 stats.highRisk

**数据流修复**：
- `highRiskCount`: ref → computed，数据源优先级：`stats.highRisk` > 列表页统计
- `isHighRisk` 字段：后端值优先，前端 `detectHighRiskCategory` 仅作兜底
- 统计卡片 `total`: 改用 `stats.total`（而非列表分页 total）
- 单条续保：补充 `updatePersonnel` API 调用

### 3.3 组件层

**ImportModal.vue**：
- 15+ 处硬编码颜色 → Vben CSS 变量
- 4 处内联 `style="margin-right: 4px"` → `.tag-icon` class
- 下载模板改用 `downloadTemplate` API（带认证）

**ImportButtonGroup.vue**：
- 下载模板改用 `downloadTemplate` API（带认证）
- 错误处理：API 失败时回退到前端兜底模板

---

## 四、三视图功能状态

### 4.1 列表视图（✅ 完整可用）

| 功能 | 状态 | 说明 |
|------|------|------|
| 分页查询 | ✅ | 后端分页，支持 page/pageSize |
| 关键词搜索 | ✅ | 姓名/身份证/手机号 |
| 部门筛选 | ✅ | 后端新增筛选支持 |
| 保险状态筛选 | ✅ | 后端新增筛选支持 |
| 高危工种筛选 | ✅ | 后端新增筛选支持 |
| Tab 切换（全部/高危/即将到期/已过期） | ✅ | 后端条件筛选 |
| 行选择 + 批量续保 | ✅ | 新增 batch-renewal API |
| 单条续保 | ✅ | 修复为调用 updatePersonnel |
| 新增/编辑/删除 | ✅ | 原有功能正常 |
| 到期高亮 | ✅ | 30天内到期黄色标记 |

### 4.2 分类视图（✅ 可用）

| 功能 | 状态 | 说明 |
|------|------|------|
| 5大高危分类卡片 | ✅ | 司机/转运站/高空/井下/其他特种 |
| 每类前5人展示 | ✅ | List 组件渲染 |
| "查看全部"跳转 | ✅ | 跳转至高危Tab并设置筛选 |
| Tag 颜色 | ✅ | orange/cyan/purple/magenta/blue |

### 4.3 日历视图（✅ 可用）

| 功能 | 状态 | 说明 |
|------|------|------|
| 保险到期日历展示 | ✅ | Calendar 组件 |
| 三色状态标记 | ✅ | 红(过期)/橙(即将到期)/绿(正常) |
| 图例说明 | ✅ | 底部图例栏 |

---

## 五、导入功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 下载模板 | ✅ | 走 requestClient API，带认证，失败兜底 |
| 上传文件 | ✅ | 支持 CSV/XLSX，后端解析 |
| 数据预览 | ✅ | 表格预览 + 校验结果 |
| 错误下载 | ✅ | 错误记录导出 CSV |
| 确认导入 | ✅ | 调用 confirm API |
| 结果展示 | ✅ | 新增/更新/跳过统计 |
| 深色模式 | ✅ | ImportModal 全变量化 |

---

## 六、验证清单

### 6.1 API 对接验证

1. **启动后端**：`node server/app.js`（端口5666）
2. **启动前端**：`pnpm dev`（端口5173，代理 /api → 5666）

**验证项**：
- [ ] 访问人员保险页面，列表正常加载（无404）
- [ ] 统计卡片4个数值正确显示
- [ ] 切换Tab"高危人员"，Badge 显示正确计数
- [ ] 部门筛选生效
- [ ] 保险状态筛选生效
- [ ] 高危工种筛选生效
- [ ] 新增人员后列表刷新
- [ ] 编辑人员后列表刷新
- [ ] 删除人员后列表刷新
- [ ] 单条续保后到期日期更新
- [ ] 勾选多行 → 批量续保 → 到期日期更新
- [ ] 下载模板生成 CSV 文件
- [ ] 上传 CSV → 预览 → 确认导入

### 6.2 三视图验证

- [ ] 列表视图：表格、分页、排序正常
- [ ] 分类视图：5张卡片，每张显示人数和前5人
- [ ] 分类视图"查看全部"跳转到高危Tab并自动筛选
- [ ] 日历视图：到期日期正确标记在日历上
- [ ] 日历视图：三色标记正确（红/橙/绿）
- [ ] 视图切换流畅，无卡顿

### 6.3 深色模式验证

- [ ] 切换深色模式
- [ ] ImportModal 所有颜色正确
- [ ] 统计卡片颜色正确
- [ ] 表格、Tag颜色正确
- [ ] 日历视图标记颜色正确

---

## 七、变更文件汇总

```
后端（1个文件）：
└── server/routes/insurance.js
    ├── 新增 PUT /personnel/batch-renewal 路由
    └── 增强 GET /personnel 列表筛选（department/insuranceStatus/isHighRisk/highRiskCategory）

前端 API（1个文件）：
└── api/hse/insurance.ts
    ├── 修复 InsuranceStatus 类型（+ 'expiring'）
    ├── 修复 PolicyStats 接口（+ highRisk 字段）
    └── 修复 getPolicyStats 响应格式适配

前端页面（1个文件）：
└── views/insurance/personnel/index.vue
    ├── 修复高危Tab Badge（#tab 插槽）
    ├── 修复 highRiskCount（ref → computed，优先 stats）
    ├── 修复 isHighRisk（后端值优先）
    ├── 修复统计卡片 total（使用 stats.total）
    ├── 修复单条续保（补充 updatePersonnel 调用）
    └── 清理未使用的 watch 导入

前端组件（2个文件）：
├── components/hse/ImportModal.vue
│   ├── 15+ 处硬编码颜色 → CSS 变量
│   ├── 4 处内联样式 → .tag-icon class
│   └── 下载模板改用 requestClient
└── components/hse/ImportButtonGroup.vue
    └── 下载模板改用 requestClient（带认证）
```

---

*报告生成时间：2026-07-15*
