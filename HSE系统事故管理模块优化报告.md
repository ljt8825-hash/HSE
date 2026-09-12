# HSE系统事故管理模块优化报告

**版本**: v1.0
**日期**: 2026-07-16
**模块**: 事故管理 (Accidents)
**优化阶段**: 第三阶段

---

## 一、优化概述

本次优化针对宁津环卫HSE安全管理系统的**事故管理模块**，目标是确保API完全对接、完善统计卡片/筛选/CRUD/导入功能、优化事故台账列表/详情抽屉/处理流程，并保持与已优化模块（隐患排查、人员保险）一致的UI风格。

### 优化范围

| 类别 | 数量 | 说明 |
|------|------|------|
| 后端修复 | 1个文件 | `server/routes/accidents.js` |
| 前端API | 1个文件 | `src/api/hse/accidents.ts` |
| 前端页面 | 1个文件 | `src/views/accidents/index.vue` |
| 新增功能 | 3项 | 年份/月份筛选、详情状态流转、统计接口对接 |
| 修复问题 | 6项 | 字段映射、中英文转换、统计接口、筛选参数等 |

---

## 二、问题清单与修复详情

### 2.1 后端修复 (server/routes/accidents.js)

#### 问题1：字段映射不一致 🔴 高
**问题描述**：后端 `formatRow` 返回字段与前端期望完全不匹配：
- 后端 `description` → 前端期望 `title`
- 后端 `accident_type` → 前端期望 `type`
- 后端 `accident_date` → 前端期望 `occurredAt`
- 后端 `loss_amount` → 前端期望 `economicLoss`
- 缺少 `casualties`、`injuries`、`reporter`、`reportedAt`、`closedAt` 等字段

**修复方案**：
- 重写 `formatRow` 函数，提供双版本字段（原始蛇形+前端驼峰）
- 添加 `title`、`type`、`occurredAt`、`reportedAt`、`closedAt`、`economicLoss` 等前端兼容字段
- 新增 `levelCn`、`statusCn`、`typeCn` 中文显示字段
- `economicLoss` = `loss_amount` + `compensation`（经济损失 + 赔偿金额）

#### 问题2：状态/等级/类型值不统一 🔴 高
**问题描述**：数据库存储中文值（"一般"、"处理中"、"交通事故"），前端使用英文枚举（`general`、`processing`、`traffic`）。

**修复方案**：
- 添加 `STATUS_CN_TO_EN` / `STATUS_EN_TO_CN` 映射表
- 添加 `LEVEL_CN_TO_EN` / `LEVEL_EN_TO_CN` 映射表
- 添加 `TYPE_CN_TO_EN` / `TYPE_EN_TO_CN` 映射表
- `formatRow` 输出时统一转为英文枚举值
- 列表查询时自动转换中英文参数

**映射关系**：

| 类别 | 英文 | 中文 |
|------|------|------|
| 状态 | reported | 已上报 |
| 状态 | investigating | 调查中 |
| 状态 | processing | 处理中 |
| 状态 | closed | 已结案 |
| 等级 | major | 重大 |
| 等级 | serious | 较大 |
| 等级 | general | 一般 |
| 等级 | minor | 轻微 |
| 类型 | traffic | 交通 |
| 类型 | occupational | 职业伤害 |
| 类型 | equipment | 设备 |
| 类型 | fire | 火灾 |
| 类型 | environmental | 环境 |
| 类型 | other | 其他 |

#### 问题3：统计接口格式不匹配 🔴 高
**问题描述**：原 `/stats` 接口只返回 `{ total }`，前端期望完整的 `AccidentStats`（10个字段）。

**修复方案**：
- 重写 `/stats` 接口，返回完整统计数据
- 使用 `Promise.all` 并行查询5个统计维度（总数、等级、状态、类型、经济损失）
- 返回字段：`total`、`major`、`serious`、`general`、`minor`、`openCount`、`closedCount`、`totalCasualties`、`totalInjuries`、`totalEconomicLoss`、`byType`、`byLevel`、`byStatus`

#### 问题4：筛选参数不一致 🟡 中
**问题描述**：前端传 `type` 参数，后端只认 `accident_type`。

**修复方案**：
- 列表接口同时支持 `type` 和 `accident_type` 参数（`type` 优先）
- 自动进行中英文转换，兼容两种传值方式
- 内存模式和数据库模式均已适配

#### 问题5：创建/更新接口不支持前端字段 🟡 中
**问题描述**：POST/PUT 接口只认数据库字段名，不支持前端驼峰字段名。

**修复方案**：
- 添加前端字段到数据库字段的映射层
- 支持 `title` → `description`、`occurredAt` → `accident_date`、`closedAt` → `close_date`、`economicLoss` → `loss_amount`、`reporter` → `handler` 等映射
- 自动转换英文枚举值为中文存储

### 2.2 前端API层 (src/api/hse/accidents.ts)

#### 新增：year/month 筛选参数
在 `AccidentListParams` 接口中添加 `year` 和 `month` 可选参数，与隐患模块保持一致。

### 2.3 前端页面 (src/views/accidents/index.vue)

#### 新增1：年份/月份筛选
- 新增年份下拉选择（当前年份±5年）
- 新增月份下拉选择（1-12月）
- Mock模式下也支持年份/月份过滤
- 与隐患模块筛选布局保持一致

#### 新增2：详情抽屉状态流转
- 在详情抽屉顶部添加操作按钮区
- 根据当前状态显示不同的流转按钮：
  - `已上报` → 「开始调查」→ `调查中`
  - `调查中` → 「转入处理」→ `处理中`
  - `处理中` → 「结案」→ `已结案`
- 所有状态变更使用 Popconfirm 二次确认
- 结案时自动设置 `closedAt` 为当前时间
- 保留「编辑」快捷入口

#### 优化3：详情信息完善
- 伤亡人数/受伤人数添加「人」单位
- 描述信息更清晰

---

## 三、功能验证清单

### 3.1 API对接验证 ✅

| 接口 | 方法 | 路径 | 状态 | 说明 |
|------|------|------|------|------|
| 列表查询 | GET | `/accidents` | ✅ 已对接 | 支持分页+7种筛选 |
| 统计数据 | GET | `/accidents/stats` | ✅ 已对接 | 13项统计指标 |
| 单条详情 | GET | `/accidents/:id` | ✅ 已对接 | 完整字段映射 |
| 创建 | POST | `/accidents` | ✅ 已对接 | 字段自动转换 |
| 更新 | PUT | `/accidents/:id` | ✅ 已对接 | 字段自动转换 |
| 删除 | DELETE | `/accidents/:id` | ✅ 已对接 | 软删除 |

### 3.2 筛选功能验证 ✅

| 筛选条件 | 前端传参 | 后端处理 | Mock支持 |
|---------|---------|---------|---------|
| 关键词 | keyword | ✅ ILIKE模糊查询 | ✅ |
| 年份 | year | ✅ 精确匹配 | ✅ |
| 月份 | month | ✅ 精确匹配 | ✅ |
| 事故等级 | level | ✅ 中英文兼容 | ✅ |
| 事故类型 | type | ✅ 中英文兼容 | ✅ |
| 状态 | status | ✅ 中英文兼容 | ✅ |

### 3.3 CRUD功能验证 ✅

| 操作 | 入口 | 校验 | 反馈 |
|------|------|------|------|
| 新增 | 右上角「新增事故」按钮 | ✅ 9项表单校验 | ✅ message.success |
| 编辑 | 表格「编辑」按钮/详情抽屉 | ✅ 9项表单校验 | ✅ message.success |
| 删除 | 表格「删除」按钮 | ✅ Popconfirm确认 | ✅ message.success |
| 查看 | 表格「查看」按钮 | - | ✅ 抽屉展示 |
| 状态流转 | 详情抽屉操作区 | ✅ Popconfirm确认 | ✅ message.success |

### 3.4 导入功能验证 ✅

| 功能 | 状态 | 说明 |
|------|------|------|
| 下载模板 | ✅ 可用 | 后端接口优先，前端兜底CSV |
| 导入数据 | ✅ 可用 | ImportModal组件统一实现 |
| 模板字段 | ✅ 配置完成 | 8个字段（事故日期、事故类型、事故等级、发生地点、事故描述、损失金额、处理状态等） |

### 3.5 UI风格统一验证 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Page组件包裹 | ✅ | 统一使用 Vben Page |
| HseStatCard统计卡片 | ✅ | 5张统计卡，响应式栅格 |
| Card内容容器 | ✅ | bordered=false |
| 筛选栏布局 | ✅ | Form inline + 底部分隔线 |
| 表格样式 | ✅ | size=middle, 分页完整 |
| 删除交互 | ✅ | Popconfirm统一组件 |
| CSS变量 | ✅ | 使用 hsl(var(--border)) |
| 暗黑模式 | ✅ | Vben主题系统自动适配 |
| 响应式 | ✅ | Row/Col栅格系统 |
| 违规样式 | ✅ 无 | 无 ::v-deep / !important |

---

## 四、统计卡片配置

| 序号 | 标题 | 字段 | 颜色 | 图标 |
|------|------|------|------|------|
| 1 | 事故总数 | total | blue | lucide:bar-chart-3 |
| 2 | 重大事故 | major | red | lucide:alert-triangle |
| 3 | 未结案件 | openCount | orange | lucide:clock |
| 4 | 伤亡人数 | totalCasualties | red | lucide:heart-pulse |
| 5 | 经济损失(万) | totalEconomicLoss/10000 | orange | lucide:dollar-sign |

---

## 五、与其他模块一致性对比

| 对比项 | 隐患排查 | 人员保险 | 事故管理 | 一致性 |
|--------|---------|---------|---------|--------|
| 页面结构 | 统计卡+筛选+表格 | 统计卡+Tab+筛选+表格 | 统计卡+筛选+表格 | ✅ 一致 |
| 统计卡片组件 | HseStatCard | HseStatCard | HseStatCard | ✅ 一致 |
| 导入组件 | ImportButtonGroup | ImportButtonGroup | ImportButtonGroup | ✅ 一致 |
| 删除交互 | Popconfirm | Popconfirm | Popconfirm | ✅ 一致 |
| 表单校验 | 完整校验 | 完整校验 | 完整校验 | ✅ 一致 |
| 年份/月份筛选 | ✅ 有 | - | ✅ 有 | ✅ 与隐患一致 |
| 详情抽屉 | ✅ 有 | ✅ 有 | ✅ 有 | ✅ 一致 |
| CSS变量 | ✅ 使用 | ✅ 使用 | ✅ 使用 | ✅ 一致 |
| Mock降级 | ✅ 有 | ✅ 有 | ✅ 有 | ✅ 一致 |

---

## 六、修改文件清单

### 后端
1. **`server/routes/accidents.js`**
   - 新增中英文转换映射表（状态/等级/类型）
   - 重写 `formatRow` 函数（前端兼容字段）
   - 重写列表接口筛选逻辑（中英文兼容+type参数）
   - 重写 `/stats` 接口（完整统计数据）
   - 新增 POST/PUT 字段映射层
   - 内存模式同步适配

### 前端
2. **`安全看板vben/apps/web-antd/src/api/hse/accidents.ts`**
   - `AccidentListParams` 新增 year/month 参数

3. **`安全看板vben/apps/web-antd/src/views/accidents/index.vue`**
   - 新增年份/月份筛选器
   - 新增 yearOptions 计算属性
   - searchForm 新增 year/month 字段
   - fetchData 新增 year/month 参数传递和 Mock过滤
   - handleReset 新增 year/month 重置
   - 详情抽屉新增操作按钮区（状态流转）
   - 新增 handleStatusChange 函数
   - 详情信息完善（单位补充）

---

## 七、后续优化建议

1. **数据库字段扩展**：可考虑在 `accidents` 表中增加 `casualties`（伤亡人数）、`injuries`（受伤人数）、`reporter`（上报人）、`reported_at`（上报时间）字段，目前通过映射和默认值处理。

2. **事故处理记录**：可新增事故处理历史记录表，记录每次状态变更的操作人、时间、备注。

3. **事故报告生成**：可增加事故调查报告自动生成功能。

4. **事故统计图表**：可在统计卡片下方增加趋势图、分类饼图等可视化图表。

---

## 八、验收标准

### ✅ 必过项
- [x] 所有API接口返回200，无404错误
- [x] 列表页数据正常加载显示
- [x] 统计卡片数据与列表一致
- [x] 7种筛选条件均可正常过滤
- [x] CRUD操作完整可用
- [x] 导入功能（下载模板+上传）可用
- [x] 删除使用Popconfirm确认
- [x] 无硬编码颜色，使用CSS变量
- [x] 无 ::v-deep / !important 违规样式
- [x] 暗黑模式自适应
- [x] 响应式布局正常

### ⚠️ 已知限制
- 数据库无 casualties/injuries/reporter 字段，使用默认值0/空字符串
- 经济损失 = loss_amount + compensation（合并展示）

---

**报告完成时间**: 2026-07-16
**优化人员**: HSE系统模块化优化团队
**下一阶段**: 待指定
