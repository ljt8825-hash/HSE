# HSE系统目标职责管理模块优化报告

**版本**: v1.0
**日期**: 2026-07-16
**模块**: 目标职责管理 (Objectives) — 含4个子菜单
**优化阶段**: 第四阶段

---

## 一、优化概述

本次优化针对宁津环卫HSE安全管理系统的**目标职责管理模块**，涵盖4个子菜单：目标责任书管理、安全人员及安委会、责任制及考核、安全费用预算及支出。目标是确保API完全对接、完善统计卡片/筛选/CRUD/导入功能、优化列表/进度条/详情抽屉/子菜单切换，并保持与已优化模块（隐患、保险、事故）一致的UI风格。

### 优化范围

| 类别 | 数量 | 说明 |
|------|------|------|
| 后端重写 | 1个文件 | `server/routes/objectives.js` |
| 前端API扩展 | 1个文件 | `src/api/hse/goals.ts` |
| 前端主页面优化 | 1个文件 | `src/views/goals/index.vue` |
| 前端子页面新增 | 3个文件 | committee / assessment / budget |
| 新增API函数 | 12个 | 3个子模块各4个（CRUD） |
| 修复问题 | 8项 | 字段映射、内存降级、筛选、子页面实现等 |

---

## 二、4个子菜单状态对比

### 优化前

| 子菜单 | 页面状态 | API对接 | 统计卡片 | 筛选 | CRUD | 导入 |
|--------|---------|---------|---------|------|------|------|
| 目标责任书管理 | ✅ 已实现 | 🔴 有问题 | ✅ 有 | ✅ 有 | ✅ 有 | ✅ 有 |
| 安全人员及安委会 | 🔴 空壳 | 🔴 无 | 🔴 无 | 🔴 无 | 🔴 无 | ✅ 按钮 |
| 责任制及考核 | 🔴 空壳 | 🔴 无 | 🔴 无 | 🔴 无 | 🔴 无 | ✅ 按钮 |
| 安全费用预算及支出 | 🔴 空壳 | 🔴 无 | 🔴 无 | 🔴 无 | 🔴 无 | ✅ 按钮 |

### 优化后

| 子菜单 | 页面状态 | API对接 | 统计卡片 | 筛选 | CRUD | 导入 |
|--------|---------|---------|---------|------|------|------|
| 目标责任书管理 | ✅ 优化 | ✅ 完全对接 | ✅ 5张卡片 | ✅ 5种筛选 | ✅ 完整 | ✅ 可用 |
| 安全人员及安委会 | ✅ 全新实现 | ✅ 完全对接 | ✅ 4张卡片 | ✅ 3种筛选 | ✅ 完整 | ✅ 可用 |
| 责任制及考核 | ✅ 全新实现 | ✅ 完全对接 | ✅ 4张卡片 | ✅ 3种筛选 | ✅ 完整 | ✅ 可用 |
| 安全费用预算及支出 | ✅ 全新实现 | ✅ 完全对接 | ✅ 4张卡片 | ✅ 3种筛选 | ✅ 完整 | ✅ 可用 |

---

## 三、问题清单与修复详情

### 3.1 后端修复 (server/routes/objectives.js)

#### 问题1：主路由无内存降级 🔴 高
**问题描述**：`GET /objectives` 在数据库未连接时直接返回空列表，前端页面无数据展示。

**修复方案**：
- 新增 `memoryStores.goals` 内存存储
- `initMemoryData` 函数自动生成10条模拟目标数据
- 所有CRUD操作支持内存模式
- 子路由同样支持内存降级

#### 问题2：字段完全不匹配 🔴 高
**问题描述**：前端期望 `title/targetValue/currentValue/progress/type/unit` 等字段，后端 `responsibilities` 表只有 `year/quarter/score/level/person/department/status/remark`。

**修复方案**：
- 新增 `formatGoalRow` 函数，将数据库字段映射为前端 `SafetyGoal` 格式
- 映射关系：
  - `remark` → `title` / `description`
  - `score` → `currentValue` / `progress`
  - `person` → `responsiblePerson`
  - `100` → `targetValue`（默认满分100）
  - `分` → `unit`
  - `{year}-12-31` → `deadline`
  - 根据score自动推断 `status`（≥90=achieved, <60=behind）

#### 问题3：统计接口不完整 🔴 高
**问题描述**：原 `/stats` 只统计2张表，返回字段不完整，缺少 `behind` 等。

**修复方案**：
- 重写 `/stats` 接口，使用 `Promise.all` 并行查询4个维度
- 返回完整字段：`total/achieved/onTrack/atRisk/behind/avgProgress/byDepartment`
- 内存模式同步支持

#### 问题4：子路由无内存降级 🔴 高
**问题描述**：`/contract`、`/org-personnel`、`/responsibility`、`/safety-budget` 4个子路由在数据库未连接时返回错误。

**修复方案**：
- 为4个子路由各自创建内存存储和初始化数据
- `createSubRoute` 函数统一处理内存降级
- 每个子模块有5-6条模拟数据

#### 问题5：创建/更新不支持前端字段 🟡 中
**问题描述**：POST/PUT 只认数据库蛇形字段名，前端传驼峰字段会丢失。

**修复方案**：
- POST/PUT 添加前端字段到数据库字段的映射层
- 支持 `responsiblePerson` → `person`、`currentValue` → `score`、`description` → `remark` 等

### 3.2 前端API层 (src/api/hse/goals.ts)

#### 新增：3个子模块API（12个函数）

| 模块 | 函数 | 路径 |
|------|------|------|
| 安全人员 | getCommitteeList / createCommittee / updateCommittee / deleteCommittee | `/objectives/org-personnel` |
| 责任制考核 | getAssessmentList / createAssessment / updateAssessment / deleteAssessment | `/objectives/responsibility` |
| 安全费用 | getBudgetList / createBudget / updateBudget / deleteBudget | `/objectives/safety-budget` |

#### 新增：3个类型命名空间

| 命名空间 | 接口 | 说明 |
|---------|------|------|
| CommitteeApi | PersonnelItem / PersonnelListParams | 安全人员类型 |
| AssessmentApi | AssessmentItem / AssessmentListParams | 责任制考核类型 |
| BudgetApi | BudgetItem / BudgetListParams | 安全费用类型 |

### 3.3 前端主页面优化 (src/views/goals/index.vue)

#### 优化1：fetchData 后自动调用 fetchStats
- API成功时：`await fetchStats()` 同步更新统计
- API失败时：Mock数据同时执行筛选过滤，统计从过滤后列表计算

#### 优化2：Mock数据支持完整筛选
- 添加 year/type/status/department/keyword 5种筛选的前端过滤

### 3.4 前端3个子页面全新实现

#### 安全人员及安委会 (committee/index.vue)
- **统计卡片**：总人数、在职人数、安全管理人员数、安委会成员数
- **表格列**：ID、姓名、职务、部门、辖区、联系电话、状态、操作
- **表单字段**：姓名、职务、部门、辖区、联系电话、状态
- **筛选**：关键词、部门、状态
- **校验**：姓名必填+长度、职务必填、部门必填、电话必填+手机号正则
- **Mock数据**：5条记录（安委会主任/安全管理员/车间安全员等）

#### 责任制及考核 (assessment/index.vue)
- **统计卡片**：考核总数、优秀数、平均分、合格率
- **表格列**：ID、年份、季度、部门、考核对象、考核分数(Progress条)、考核等级(Tag)、状态(Tag)、操作
- **表单字段**：年份、季度、部门、考核对象、考核分数、考核等级、状态、备注
- **筛选**：关键词、年份、状态
- **校验**：年份必填、季度必填、部门必填、考核对象必填、分数0-100
- **Mock数据**：5条记录（5个部门各1条考核记录）

#### 安全费用预算及支出 (budget/index.vue)
- **统计卡片**：预算总额(万)、已使用(万)、执行率、项目数
- **表格列**：ID、年份、项目名称、类别(Tag)、预算金额(¥格式化)、已使用(¥格式化)、执行率(Progress条)、状态(Tag)、操作
- **表单字段**：年份、项目名称、类别、预算金额、已使用金额、状态、备注
- **筛选**：关键词、年份、状态
- **校验**：年份必填、项目名称必填+长度、类别必填、预算金额必填+大于0、已使用不超过预算
- **Mock数据**：6条记录（6个预算项目）

---

## 四、功能验证清单

### 4.1 API对接验证 ✅

| 子菜单 | 接口 | 方法 | 路径 | 内存模式 | 数据库模式 |
|--------|------|------|------|---------|-----------|
| 目标责任书 | 列表 | GET | `/objectives` | ✅ | ✅ |
| 目标责任书 | 统计 | GET | `/objectives/stats` | ✅ | ✅ |
| 目标责任书 | 详情 | GET | `/objectives/:id` | ✅ | ✅ |
| 目标责任书 | 创建 | POST | `/objectives` | ✅ | ✅ |
| 目标责任书 | 更新 | PUT | `/objectives/:id` | ✅ | ✅ |
| 目标责任书 | 删除 | DELETE | `/objectives/:id` | ✅ | ✅ |
| 安全人员 | CRUD | ALL | `/objectives/org-personnel/*` | ✅ | ✅ |
| 责任制考核 | CRUD | ALL | `/objectives/responsibility/*` | ✅ | ✅ |
| 安全费用 | CRUD | ALL | `/objectives/safety-budget/*` | ✅ | ✅ |

### 4.2 筛选功能验证 ✅

| 子菜单 | 筛选条件 | Mock支持 |
|--------|---------|---------|
| 目标责任书 | 关键词、年份、类型、状态、部门 | ✅ |
| 安全人员 | 关键词、部门、状态 | ✅ |
| 责任制考核 | 关键词、年份、状态 | ✅ |
| 安全费用 | 关键词、年份、状态 | ✅ |

### 4.3 CRUD功能验证 ✅

| 子菜单 | 新增 | 编辑 | 删除 | 查看 | 表单校验 |
|--------|------|------|------|------|---------|
| 目标责任书 | ✅ | ✅ | ✅ Popconfirm | ✅ Drawer | ✅ 9项 |
| 安全人员 | ✅ | ✅ | ✅ Popconfirm | ✅ Drawer | ✅ 4项 |
| 责任制考核 | ✅ | ✅ | ✅ Popconfirm | ✅ Drawer | ✅ 5项 |
| 安全费用 | ✅ | ✅ | ✅ Popconfirm | ✅ Drawer | ✅ 5项 |

### 4.4 导入功能验证 ✅

| 子菜单 | 模块名 | 下载模板 | 上传导入 | 模板字段 |
|--------|--------|---------|---------|---------|
| 目标责任书 | objectives | ✅ | ✅ | 7字段 |
| 安全人员 | committee | ✅ | ✅ | 6字段 |
| 责任制考核 | assessment | ✅ | ✅ | 7字段 |
| 安全费用 | budget | ✅ | ✅ | 7字段 |

### 4.5 UI风格统一验证 ✅

| 检查项 | 目标责任书 | 安全人员 | 责任制考核 | 安全费用 |
|--------|-----------|---------|-----------|---------|
| Page组件 | ✅ | ✅ | ✅ | ✅ |
| HseStatCard | ✅ 5张 | ✅ 4张 | ✅ 4张 | ✅ 4张 |
| Card :bordered=false | ✅ | ✅ | ✅ | ✅ |
| ImportButtonGroup | ✅ | ✅ | ✅ | ✅ |
| Popconfirm删除 | ✅ | ✅ | ✅ | ✅ |
| 完整分页 | ✅ | ✅ | ✅ | ✅ |
| Modal表单 | ✅ | ✅ | ✅ | ✅ |
| Drawer详情 | ✅ | ✅ | ✅ | ✅ |
| CSS变量 | ✅ | ✅ | ✅ | ✅ |
| 无违规样式 | ✅ | ✅ | ✅ | ✅ |
| 响应式栅格 | ✅ | ✅ | ✅ | ✅ |
| Mock降级 | ✅ | ✅ | ✅ | ✅ |

---

## 五、统计卡片配置汇总

### 目标责任书管理（5张）

| 序号 | 标题 | 字段 | 颜色 | 图标 |
|------|------|------|------|------|
| 1 | 目标总数 | total | blue | lucide:target |
| 2 | 已达成 | achieved | green | lucide:check-circle-2 |
| 3 | 进行中 | onTrack | cyan | lucide:clock |
| 4 | 风险预警 | atRisk | red | lucide:alert-octagon |
| 5 | 平均进度 | avgProgress% | orange | lucide:bar-chart-3 |

### 安全人员及安委会（4张）

| 序号 | 标题 | 计算方式 | 颜色 | 图标 |
|------|------|---------|------|------|
| 1 | 总人数 | list.length | blue | lucide:users |
| 2 | 在职人数 | filter(status=在职) | green | lucide:user-check |
| 3 | 安全管理人员 | filter(dept=安全环保部) | orange | lucide:hard-hat |
| 4 | 安委会成员 | filter(position含安委会) | cyan | lucide:landmark |

### 责任制及考核（4张）

| 序号 | 标题 | 计算方式 | 颜色 | 图标 |
|------|------|---------|------|------|
| 1 | 考核总数 | list.length | blue | lucide:clipboard-list |
| 2 | 优秀数 | filter(level=优秀) | green | lucide:award |
| 3 | 平均分 | avg(score) | cyan | lucide:bar-chart-3 |
| 4 | 合格率 | filter(score≥60)/total | orange | lucide:check-circle |

### 安全费用预算及支出（4张）

| 序号 | 标题 | 计算方式 | 颜色 | 图标 |
|------|------|---------|------|------|
| 1 | 预算总额 | sum(budget)/10000万 | blue | lucide:banknote |
| 2 | 已使用 | sum(used)/10000万 | orange | lucide:trending-down |
| 3 | 执行率 | sum(used)/sum(budget) | cyan | lucide:percent |
| 4 | 项目数 | list.length | green | lucide:folder |

---

## 六、与其他模块一致性对比

| 对比项 | 隐患排查 | 人员保险 | 事故管理 | 目标责任书 | 安全人员 | 责任制考核 | 安全费用 |
|--------|---------|---------|---------|-----------|---------|-----------|---------|
| Page组件 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| HseStatCard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ImportButtonGroup | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Popconfirm删除 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 完整表单校验 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mock降级 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CSS变量 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 进度条显示 | ✅ | - | - | ✅ | - | ✅ | ✅ |
| 详情抽屉 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 七、修改文件清单

### 后端
1. **`server/routes/objectives.js`** — 完全重写
   - 新增5个内存存储 + 初始化数据
   - 新增 `formatGoalRow` 字段映射函数
   - 新增状态中英文映射表
   - 重写主路由 GET/POST/PUT/DELETE（内存降级+字段映射+筛选）
   - 重写 `/stats` 统计接口（完整7字段）
   - 重写 `createSubRoute` 通用子路由工厂（内存降级+DB双模式）
   - 4个子路由全部支持内存降级

### 前端API
2. **`安全看板vben/apps/web-antd/src/api/hse/goals.ts`**
   - 新增 `CommitteeApi` 命名空间 + 4个API函数
   - 新增 `AssessmentApi` 命名空间 + 4个API函数
   - 新增 `BudgetApi` 命名空间 + 4个API函数

### 前端页面
3. **`安全看板vben/apps/web-antd/src/views/goals/index.vue`** — 优化
   - fetchData 成功后自动调用 fetchStats
   - Mock降级支持完整5种筛选过滤

4. **`安全看板vben/apps/web-antd/src/views/objectives/committee/index.vue`** — 全新实现
   - 安全人员及安委会管理页面

5. **`安全看板vben/apps/web-antd/src/views/objectives/assessment/index.vue`** — 全新实现
   - 责任制及考核管理页面

6. **`安全看板vben/apps/web-antd/src/views/objectives/budget/index.vue`** — 全新实现
   - 安全费用预算及支出管理页面

---

## 八、验收标准

### ✅ 必过项
- [x] 所有API接口返回200，无404错误
- [x] 4个子菜单页面全部可正常访问
- [x] 4个页面数据正常加载显示（含Mock降级）
- [x] 统计卡片数据正确
- [x] 所有筛选条件均可正常过滤
- [x] CRUD操作完整可用
- [x] 导入功能（下载模板+上传）可用
- [x] 删除使用Popconfirm确认
- [x] 无硬编码颜色，使用CSS变量
- [x] 无 ::v-deep / !important 违规样式
- [x] 暗黑模式自适应
- [x] 响应式布局正常
- [x] 进度条正确显示（目标责任书/责任制考核/安全费用）
- [x] 详情抽屉完整展示

### ⚠️ 已知限制
- 主路由（目标责任书）将 `responsibilities` 表的 `score` 映射为 `currentValue` 和 `progress`
- `type` 字段在数据库中不存在，内存模式使用前端传入值，数据库模式固定为 `custom`
- 子路由（DB模式）未做 formatRow，返回原始蛇形字段，前端已适配

---

**报告完成时间**: 2026-07-16
**优化人员**: HSE系统模块化优化团队
**下一阶段**: 待指定
