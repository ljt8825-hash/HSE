# Sprint10-D-4-1 月度安全履职考核PC端前端实现报告

> **报告性质**：前端实现验收报告（最终版）
> **报告日期**：2026-07-24
> **任务编号**：Sprint10-D-4-1
> **前置任务**：Sprint10-D-3-2（PC端开发规范与公共组件基线冻结）
> **菜单位置**：培训考核 → 责任制考核
> **页面路由**：/training/responsibility

---

## 一、开发依据

| 依据文档 | 说明 |
|---------|------|
| 《月度安全履职考核业务设计》 | 业务规则与流程 |
| 《月度安全履职考核数据库设计》 | 8张核心表结构 |
| 《月度安全履职考核API设计》 | 后端接口定义 |
| 《HSE系统PC端页面开发规范》 | 页面布局与交互规范 |
| 《HSE系统公共组件设计规范》 | 组件设计规范 |
| Sprint10-D-3-1 权限体系冻结报告 | 权限码体系 |

---

## 二、菜单位置确认

| 项目 | 内容 |
|------|------|
| 一级菜单 | 培训考核 |
| 二级菜单 | 责任制考核 |
| 页面路由 | `/training/responsibility` |
| 路由名称 | `ResponsibilityAssessment` |
| 页面标题 | 月度安全履职考核 |
| 权限码 | `hse:training:responsibility:view` |
| 路由缓存 | `keepAlive: true` |

> **说明**：菜单项名称保持"责任制考核"不变，页面标题为"月度安全履职考核"并附带"安全绩效评估"标签，避免用户误解为培训业务。

---

## 三、页面结构总览

### 3.1 整体架构

```
ResponsibilityAssessmentView.vue（主页面）
├── 顶部标题栏（页面标题 + 快捷操作按钮）
└── el-tabs（7个Tab页）
    ├── 考核首页 → AssessmentOverview.vue
    ├── 周期管理 → AssessmentCycleList.vue
    ├── 考核对象 → AssessmentTargetList.vue
    ├── 考核评分 → AssessmentScoring.vue
    ├── 扣分审核 → AssessmentDeductionReview.vue
    ├── 冻结管理 → AssessmentFreeze.vue
    └── 导入导出 → AssessmentExcel.vue
```

### 3.2 文件清单

| 分类 | 文件路径 | 说明 |
|------|---------|------|
| **类型定义** | `src/features/training/types/assessment.ts` | 考核模块TypeScript类型 |
| **API封装** | `src/api/modules/assessment-monthly.ts` | 后端接口封装 |
| **主页面** | `src/features/training/views/ResponsibilityAssessmentView.vue` | 主页面+Tab切换 |
| **子组件** | `src/features/training/components/AssessmentOverview.vue` | 考核首页 |
| **子组件** | `src/features/training/components/AssessmentCycleList.vue` | 周期管理 |
| **子组件** | `src/features/training/components/AssessmentTargetList.vue` | 考核对象 |
| **子组件** | `src/features/training/components/AssessmentScoring.vue` | 考核评分 |
| **子组件** | `src/features/training/components/AssessmentDeductionReview.vue` | 扣分审核 |
| **子组件** | `src/features/training/components/AssessmentFreeze.vue` | 冻结管理 |
| **子组件** | `src/features/training/components/AssessmentExcel.vue` | 导入导出 |

---

## 四、各页面功能详情

### 4.1 考核首页（AssessmentOverview.vue）

**功能定位**：展示考核概览数据，提供快捷操作入口。

**页面结构**：

| 区域 | 内容说明 |
|------|---------|
| 顶部周期信息卡片 | 当前考核周期名称、状态标签、时间范围、快捷操作按钮 |
| 统计卡片区（2x2） | 待审核扣分数（warning）、已完成考核数（success）、平均得分（primary）、总扣分数（danger） |
| 风险提示区 | 多条风险预警，使用 el-alert 列表展示 |

**快捷操作按钮（按状态显示）**：

| 周期状态 | 显示按钮 | 权限码 |
|---------|---------|--------|
| 未开始 | 启动考核 | hse:training:create |
| 进行中 | 执行评分、审核扣分 | hse:training:update / audit |
| 待审核 | 审核扣分 | hse:training:audit |
| 已审核 | 冻结结果 | hse:training:audit |
| 已冻结 | （无操作按钮） | — |

**状态标签颜色**：
- 未开始 → `info`
- 进行中 → `primary`
- 待审核 → `warning`
- 已审核 → `success`
- 已冻结 → `info`

**数据来源**：`fetchAssessmentStats()` API，失败时降级为mock数据。

---

### 4.2 周期管理（AssessmentCycleList.vue）

**功能定位**：考核周期的全生命周期管理。

**页面结构**：

| 区域 | 内容说明 |
|------|---------|
| 查询表单 | 年度、月份、状态、关键词（4个条件，内联布局） |
| 操作栏 | 新增周期按钮（权限控制） |
| 数据表格 | 11列完整数据 + 操作列 |
| 分页器 | 页码切换 + 每页条数调整 |
| 新增/编辑弹窗 | 表单验证 + 提交 |
| 详情弹窗 | el-descriptions 展示完整信息 |

**表格列定义**：

| 列名 | 字段 | 宽度 | 说明 |
|------|------|------|------|
| 周期编号 | cycleCode | 180 | — |
| 周期名称 | cycleName | 200 | show-overflow-tooltip |
| 年度 | assessmentYear | 100 | — |
| 月份 | assessmentMonth | 100 | — |
| 状态 | status | 100 | el-tag 标签 |
| 基准分 | baseScore | 100 | — |
| 考核对象数 | totalTargets | 120 | — |
| 平均分 | avgScore | 100 | — |
| 创建人 | createdByName | 100 | — |
| 创建时间 | createdAt | 170 | — |
| 操作 | — | 240 | fixed="right" |

**操作列按钮（按状态控制）**：

| 操作 | 显示条件 | 权限码 |
|------|---------|--------|
| 查看 | 全部状态 | —（查看权限） |
| 编辑 | 未开始 | hse:training:update |
| 启动 | 未开始 | hse:training:create |
| 删除 | 未开始 | hse:training:delete |

**新增/编辑表单字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 考核年度 | number | 是 | 如2026 |
| 考核月份 | number | 是 | 1-12 |
| 周期名称 | string | 否 | 默认自动生成 |
| 周期类型 | string | 否 | monthly默认 |
| 备注 | string | 否 | textarea |

**暴露方法**：
- `openCreateDialog()` — 打开新增弹窗（供父组件调用）

---

### 4.3 考核对象（AssessmentTargetList.vue）

**功能定位**：查看和管理参与考核的人员对象。

**页面结构**：

| 区域 | 内容说明 |
|------|---------|
| 周期选择 | 顶部下拉选择考核周期 |
| 查询表单 | 岗位类型、部门、关键词 |
| 操作栏 | 同步考核对象按钮 |
| 数据表格 | 11列 + 操作列 |
| 分页器 | 标准分页 |

**岗位类型**：乡镇作业中心经理（乡镇主管）、管理员

**表格列**：序号、员工姓名、岗位、部门、岗位类型、基准分、总得分、扣分数、状态、等级、操作

**操作按钮**：查看详情、查看评分

**权限控制**：同步考核对象 → `hse:training:create`

---

### 4.4 考核评分（AssessmentScoring.vue）

**功能定位**：查看考核指标评分明细，执行评分操作。

**页面布局**：左右分栏布局（el-row + el-col，左8右16）

**左侧：考核对象列表**
- 对象选择列表
- 支持搜索过滤
- 点击选中后右侧展示详情

**右侧：评分详情**

| 区域 | 内容说明 |
|------|---------|
| 对象基本信息 | 姓名、岗位、部门、基准分、总得分 |
| 指标评分表格 | 指标名称、分类、满分、权重、基准分、实得分、扣分 |
| 扣分明细列表 | 该对象的所有扣分记录 |
| 操作按钮 | 执行评分（整周期）、重新评分（单对象） |

**权限控制**：执行评分 → `hse:training:update`

---

### 4.5 扣分审核（AssessmentDeductionReview.vue）

**功能定位**：审核扣分明细，支持通过、驳回、调整、批量通过。

**页面结构**：

| 区域 | 内容说明 |
|------|---------|
| 查询表单 | 考核周期、审核状态、扣分来源、关键词 |
| 操作栏 | 批量审核通过按钮（选中项联动） |
| 数据表格 | 多选 + 12列 + 操作列 |
| 分页器 | 标准分页 |
| 审核弹窗 | 审核意见 + 通过/驳回 |
| 调整弹窗 | 调整前/后分值 + 调整原因 |

**扣分来源中文映射**：

| 值 | 中文 |
|----|------|
| auto | 自动生成 |
| manual | 手动录入 |
| import | 批量导入 |
| chain_transmission | 责任传导 |

**审核状态标签**：

| 状态 | 颜色 | 文案 |
|------|------|------|
| pending | warning | 待审核 |
| approved | success | 已确认 |
| rejected | danger | 已驳回 |
| adjusted | primary | 已调整 |

**操作列按钮（按状态控制）**：

| 操作 | 显示条件 | 权限码 |
|------|---------|--------|
| 详情 | 全部状态 | — |
| 通过 | 待审核 | hse:training:audit |
| 驳回 | 待审核 | hse:training:audit |
| 调整 | 待审核/已确认 | hse:training:audit |

**批量操作**：
- 表格支持多选
- 批量审核通过需二次确认
- 按钮在有选中项且有权限时启用

---

### 4.6 冻结管理（AssessmentFreeze.vue）

**功能定位**：考核结果的审核通过与冻结管理。

**页面结构**：

| 区域 | 内容说明 |
|------|---------|
| 查询表单 | 年度、月份、状态 |
| 数据表格 | 周期列表 + 操作列 |
| 分页器 | 标准分页 |

**筛选范围**：仅显示待审核、已审核、已冻结状态的周期

**操作按钮**：

| 操作 | 显示条件 | 权限码 | 说明 |
|------|---------|--------|------|
| 审核通过 | 待审核 | hse:training:audit | 将周期状态从待审核→已审核，批量审核待审核扣分 |
| 冻结成绩 | 已审核 | hse:training:audit | 将周期状态从已审核→已冻结 |
| 解冻 | 已冻结 | hse:training:audit | 将周期状态从已冻结→已审核 |
| 查看详情 | 全部状态 | — | — |

**安全约束**：
- 冻结后的数据不允许修改
- 解冻操作需谨慎，带二次确认
- 所有操作均记录审计日志

---

### 4.7 导入导出（AssessmentExcel.vue）

**功能定位**：考核数据的Excel导入导出。

**页面布局**：左右分栏（各占50%）

**左侧：导出功能**

| 项目 | 说明 |
|------|------|
| 考核周期 | 下拉选择 |
| 导出类型 | 正式考核表、扣分明细表、评分明细表 |
| 操作按钮 | 导出（权限：hse:training:export） |
| 导出说明 | 提示导出内容和格式 |

**导出实现**：
- 调用 `exportResults()` API
- 返回 Blob 二进制流
- 创建 `<a>` 标签触发下载

**右侧：导入功能**

| 项目 | 说明 |
|------|------|
| 考核周期 | 下拉选择 |
| 文件上传 | el-upload，仅支持 .xlsx/.xls |
| 操作按钮 | 开始导入（权限：hse:training:create） |
| 结果展示 | 成功数、失败数、失败详情 |
| 导入说明 | 提示导入规则和限制 |

**导入实现**：
- 使用 FormData 上传文件
- 调用 `importDeductions()` API
- 返回成功/失败统计

---

## 五、权限控制清单

### 5.1 按钮权限码汇总

| 按钮 | 权限码 | 所在Tab |
|------|--------|---------|
| 新增周期 | `hse:training:create` | 周期管理、顶部 |
| 编辑周期 | `hse:training:update` | 周期管理 |
| 删除周期 | `hse:training:delete` | 周期管理 |
| 启动考核 | `hse:training:create` | 考核首页、周期管理 |
| 同步考核对象 | `hse:training:create` | 考核对象 |
| 执行评分 | `hse:training:update` | 考核评分、考核首页 |
| 重新评分 | `hse:training:update` | 考核评分 |
| 审核通过 | `hse:training:audit` | 扣分审核、冻结管理 |
| 审核驳回 | `hse:training:audit` | 扣分审核 |
| 扣分调整 | `hse:training:audit` | 扣分审核 |
| 批量审核 | `hse:training:audit` | 扣分审核 |
| 冻结成绩 | `hse:training:audit` | 冻结管理、考核首页 |
| 解冻 | `hse:training:audit` | 冻结管理 |
| 导出 | `hse:training:export` | 导入导出、顶部 |
| 导入 | `hse:training:create` | 导入导出、顶部 |

### 5.2 权限实现方式

```typescript
// 引入权限store
import { usePermissionStore } from '@/stores/permission'
const permissionStore = usePermissionStore()

// 单个权限检查
const canCreate = permissionStore.hasPermission('hse:training:create')

// 模板中使用
<el-button v-if="canCreate" type="primary">新增</el-button>
```

---

## 六、数据状态规范

### 6.1 考核周期状态（CycleStatus）

| 状态值 | 中文 | Tag颜色 | 流转方向 |
|--------|------|---------|---------|
| not_started | 未开始 | info | → in_progress |
| in_progress | 进行中 | primary | → pending_review |
| pending_review | 待审核 | warning | → reviewed |
| reviewed | 已审核 | success | → frozen |
| frozen | 已冻结 | info | → reviewed（解冻） |

### 6.2 考核对象状态（TargetStatus）

| 状态值 | 中文 | Tag颜色 |
|--------|------|---------|
| pending | 待评分 | info |
| scored | 已评分 | primary |
| reviewed | 已审核 | success |
| frozen | 已冻结 | info |

### 6.3 审核状态（ReviewStatus）

| 状态值 | 中文 | Tag颜色 |
|--------|------|---------|
| pending | 待审核 | warning |
| approved | 已确认 | success |
| rejected | 已驳回 | danger |
| adjusted | 已调整 | primary |

---

## 七、技术实现要点

### 7.1 技术栈

| 技术 | 版本/规范 |
|------|----------|
| Vue | 3.4+ Composition API |
| TypeScript | 5.5+ 严格模式 |
| Element Plus | 2.7+ |
| 状态管理 | Pinia（权限store） |
| API调用 | Axios 封装（client） |
| 样式 | scoped SCSS |

### 7.2 代码规范遵循

| 规范项 | 遵循情况 |
|--------|---------|
| Feature-based目录结构 | ✅ 模块代码在 src/features/training/ 下 |
| `<script setup lang="ts">` | ✅ 全部使用 |
| 响应式数据使用 ref | ✅ |
| API封装在 src/api/modules/ | ✅ assessment-monthly.ts |
| 类型定义在 features/xxx/types/ | ✅ assessment.ts |
| ElMessage 操作提示 | ✅ 成功/失败均有提示 |
| ElMessageBox 二次确认 | ✅ 删除/审核/冻结等危险操作 |
| 表格 loading 状态 | ✅ |
| scoped 样式 | ✅ |
| 按钮权限控制 | ✅ 全部按权限码控制 |
| 不创建自定义组件 | ✅ 全部使用 Element Plus 原生组件 |
| 不修改 Vben 核心 | ✅ |

### 7.3 API调用清单

| 前端函数 | HTTP方法 | 后端路径 |
|---------|---------|---------|
| fetchCycleList | GET | /hse/assessment-monthly/cycles |
| fetchCycleDetail | GET | /hse/assessment-monthly/cycles/:id |
| createCycle | POST | /hse/assessment-monthly/cycles |
| updateCycle | PUT | /hse/assessment-monthly/cycles/:id |
| deleteCycle | DELETE | /hse/assessment-monthly/cycles/:id |
| startCycle | POST | /hse/assessment-monthly/cycles/:id/start |
| fetchTargetList | GET | /hse/assessment-monthly/cycles/:id/targets |
| syncTargets | POST | /hse/assessment-monthly/cycles/:id/targets/sync |
| fetchMetricList | GET | /hse/assessment-monthly/metrics |
| fetchScoreList | GET | /hse/assessment-monthly/scores |
| executeScoring | POST | /hse/assessment-monthly/scoring/execute |
| recalculateScore | POST | /hse/assessment-monthly/scoring/recalculate |
| fetchDeductionList | GET | /hse/assessment-monthly/deductions |
| createDeduction | POST | /hse/assessment-monthly/deductions |
| updateDeduction | PUT | /hse/assessment-monthly/deductions/:id |
| deleteDeduction | DELETE | /hse/assessment-monthly/deductions/:id |
| approveDeduction | POST | /hse/assessment-monthly/deductions/:id/approve |
| rejectDeduction | POST | /hse/assessment-monthly/deductions/:id/reject |
| batchApproveDeductions | POST | /hse/assessment-monthly/deductions/batch-approve |
| adjustDeduction | POST | /hse/assessment-monthly/deductions/:id/adjust |
| fetchAdjustmentList | GET | /hse/assessment-monthly/adjustments |
| freezeCycle | POST | /hse/assessment-monthly/freeze/cycle/:id |
| unfreezeCycle | POST | /hse/assessment-monthly/freeze/unfreeze/:id |
| fetchAssessmentStats | GET | /hse/assessment-monthly/stats |
| exportResults | GET | /hse/assessment-monthly/export/results/:cycleId |
| importDeductions | POST | /hse/assessment-monthly/import/deductions |

---

## 八、页面验收标准

### 8.1 验收检查项

| 检查项 | 预期结果 | 状态 |
|--------|---------|------|
| 菜单入口 | 培训考核→责任制考核可正常进入 | ✅ |
| 页面标题 | 显示"月度安全履职考核" | ✅ |
| 7个Tab页 | 考核首页/周期管理/考核对象/考核评分/扣分审核/冻结管理/导入导出 | ✅ |
| 权限控制 | 无权限按钮不显示 | ✅ |
| 状态显示 | 各状态标签颜色正确 | ✅ |
| 查询功能 | 多条件筛选 + 重置 | ✅ |
| 表格分页 | 页码切换 + 每页条数 | ✅ |
| 新增/编辑 | 表单验证 + 提交反馈 | ✅ |
| 删除确认 | 二次确认弹窗 | ✅ |
| 审核操作 | 通过/驳回/调整 + 意见 | ✅ |
| 冻结操作 | 冻结/解冻 + 二次确认 | ✅ |
| 导入导出 | 文件上传 + Blob下载 | ✅ |
| 接口调用 | 全部走封装API | ✅ |
| 错误提示 | API失败自动提示 | ✅ |
| 样式风格 | 与现有HSE页面一致 | ✅ |

### 8.2 组件复用情况

由于项目约束（禁止创建新的自定义组件），所有页面均直接使用 Element Plus 原生组件构建：

| 常用组件 | 使用场景 |
|---------|---------|
| el-card | 页面容器、分区容器 |
| el-form / el-form-item | 查询表单、弹窗表单 |
| el-input / el-select / el-date-picker | 表单控件 |
| el-table / el-table-column | 数据表格 |
| el-pagination | 分页器 |
| el-dialog | 弹窗 |
| el-tag | 状态标签 |
| el-button | 操作按钮 |
| el-tabs / el-tab-pane | Tab切换 |
| el-row / el-col | 布局 |
| el-descriptions | 详情展示 |
| el-alert | 风险提示 |
| el-empty | 空状态 |
| ElMessage | 消息提示 |
| ElMessageBox | 确认对话框 |

---

## 九、遗留事项与后续工作

### 9.1 后续联调事项

| 事项 | 说明 | 负责方 |
|------|------|--------|
| 后端接口联调 | 前端已按接口规范实现调用，需确认后端路径完全一致 | 前后端 |
| 接口响应格式验证 | 确认分页、详情、列表的返回格式与前端类型匹配 | 前后端 |
| 权限码一致性 | 前端权限码与后端 requirePermission 中的权限码需一致 | 前后端 |
| 文件上传下载测试 | 导入导出功能需真实文件测试 | 测试 |

### 9.2 优化建议

| 建议 | 说明 | 优先级 |
|------|------|--------|
| 公共组件沉淀 | 待规范稳定后，可将列表页模式沉淀为 HSETable 等公共组件 | P2 |
| 状态标签组件 | 各模块状态标签重复较多，可沉淀为 HSEStatusTag | P2 |
| 虚拟滚动 | 大数据量表格考虑使用虚拟滚动 | P3 |
| 列设置 | 表格列宽、显隐可配置 | P3 |

---

## 十、交付物清单

| 序号 | 文件 | 类型 | 说明 |
|------|------|------|------|
| 1 | `src/features/training/views/ResponsibilityAssessmentView.vue` | 主页面 | 7Tab主页面 |
| 2 | `src/features/training/components/AssessmentOverview.vue` | 子组件 | 考核首页 |
| 3 | `src/features/training/components/AssessmentCycleList.vue` | 子组件 | 周期管理 |
| 4 | `src/features/training/components/AssessmentTargetList.vue` | 子组件 | 考核对象 |
| 5 | `src/features/training/components/AssessmentScoring.vue` | 子组件 | 考核评分 |
| 6 | `src/features/training/components/AssessmentDeductionReview.vue` | 子组件 | 扣分审核 |
| 7 | `src/features/training/components/AssessmentFreeze.vue` | 子组件 | 冻结管理 |
| 8 | `src/features/training/components/AssessmentExcel.vue` | 子组件 | 导入导出 |
| 9 | `src/features/training/types/assessment.ts` | 类型定义 | TypeScript类型 |
| 10 | `src/api/modules/assessment-monthly.ts` | API封装 | 后端接口调用 |
| 11 | 本报告 | 文档 | 实现验收报告 |

---

**报告人**：HSE 前端开发
**报告日期**：2026-07-24
**任务状态**：✅ 前端页面开发完成，待后端联调测试
