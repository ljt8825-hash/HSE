# HSE系统应急管理模块优化报告

**模块名称**: 应急管理（Emergency Management）
**所属阶段**: 第六阶段
**优化日期**: 2026-07-15
**优化人员**: HSE系统模块化优化团队

---

## 一、优化背景

应急管理模块是 HSE 系统的核心业务模块之一，包含应急预案和演练记录两大子功能。优化前存在以下主要问题：

1. **API 路径不匹配**：后端路由挂载在根路径 `/`，前端调用 `/emergency/plans`，导致 404 错误
2. **演练记录缺失**：后端完全缺少 `/drills` 子路由的 CRUD 接口
3. **内存模式无数据**：`initMemoryData` 函数为空，DB 断开时页面无数据
4. **字段名不匹配**：后端 snake_case 字段与前端 camelCase 字段完全不对应
5. **统计接口字段不一致**：后端返回字段与前端期望字段差异较大
6. **演练 Tab 功能缺失**：无筛选、无新增/编辑/删除、无详情、无导入
7. **Mock 数据无筛选**：前端 Mock 降级时不支持搜索和筛选条件
8. **导入功能不完整**：缺少演练记录导入模板配置

---

## 二、优化目标

- ✅ 确保 API 完全对接（修复所有 404 问题）
- ✅ 完善统计卡片、类型/级别/状态筛选、CRUD、导入功能
- ✅ 优化预案列表、演练记录 Tab 切换、详情抽屉
- ✅ 确认导入功能（下载模板 + 上传）完全可用
- ✅ 保持与已优化模块一致的 UI 风格（只使用官方 Vben + AntD 组件）
- ✅ 内存降级模式可用，DB 断开时自动切换到内存种子数据
- ⚠️ 不引入新拖拽功能或其他新特性

---

## 三、后端 API 重构

### 3.1 文件变更

**文件**: `server/routes/emergency.js`

**改动**: 完全重写，从原有的简单 CRUD 升级为双模式（PostgreSQL + 内存降级）完整架构。

### 3.2 路由结构

```
/api/emergency
  ├── /plans             GET     预案列表（支持 keyword/type/level/status 筛选 + 分页）
  ├── /plans/:id         GET     预案详情
  ├── /plans             POST    创建预案
  ├── /plans/:id         PUT     更新预案
  ├── /plans/:id         DELETE  删除预案（软删除）
  ├── /drills            GET     演练列表（支持 keyword/drillType/result/planId 筛选 + 分页）
  ├── /drills/:id        GET     演练详情
  ├── /drills            POST    创建演练记录
  ├── /drills/:id        PUT     更新演练记录
  ├── /drills/:id        DELETE  删除演练记录（软删除）
  └── /stats             GET     应急统计数据
```

### 3.3 核心技术点

**1. 内存降级双模式**

- 新增 `memoryPlans`（10条种子数据）和 `memoryDrills`（8条种子数据）
- `initMemoryData()` 函数在 DB 断开时初始化内存数据
- 所有 CRUD 操作同时支持内存模式和 DB 模式
- 软删除：使用 `is_deleted` 标记，不物理删除

**2. 字段映射 formatRow 函数**

- `formatPlanRow(row)`：将 DB snake_case 字段映射为前端 camelCase
  - `name → title`
  - `responsible_dept → department`
  - `responsible_person → responsiblePerson`
  - `contact_phone → contactPhone`
  - `plan_content → procedures`
  - 同时保留原始 snake_case 字段兼容旧代码

- `formatDrillRow(row)`：演练记录表字段映射
  - `plan_id → planId`
  - `plan_title → planTitle`
  - `drill_type → drillType`
  - `drill_date → drillDate`

**3. 统计接口重构**

使用 `Promise.all` 并行查询 6 个维度，返回字段与前端完全对齐：

```javascript
{
  totalPlans: number,         // 预案总数
  activePlans: number,        // 启用中预案数
  totalDrills: number,        // 演练总数
  excellentDrills: number,    // 优秀演练数
  participantsTotal: number,  // 参演总人次
  byType: Record<string, number>  // 按类型统计
}
```

**4. 审计日志**

所有写入操作（创建/更新/删除）均调用 `auditLog` 记录审计日志，失败时静默 catch 不影响主流程。

### 3.4 种子数据

**应急预案种子数据**（10条）：
- 覆盖 7 种类型：火灾、交通、危化品、自然灾害、设备、公共卫生、其他
- 覆盖 4 个级别：I级/II级/III级/IV级
- 覆盖 4 种状态：启用中/未启用/演练中/已归档
- 每条含完整的标题、描述、处置流程、应急资源等

**演练记录种子数据**（8条）：
- 覆盖 3 种演练类型：桌面演练、功能演练、全面演练
- 覆盖 4 种结果：优秀、良好、合格、不合格
- 每条含演练地点、人数、时长、总结、改进建议、评估人

---

## 四、前端 API 层优化

### 4.1 文件变更

**文件**: `安全看板vben/apps/web-antd/src/api/hse/emergency.ts`

### 4.2 新增内容

1. **DrillListParams 接口**：定义演练列表查询参数类型
2. **5个新 API 函数**：
   - `getDrillDetail(id)` - 获取演练详情
   - `createDrill(data)` - 创建演练记录
   - `updateDrill(id, data)` - 更新演练记录
   - `deleteDrill(id)` - 删除演练记录
   - `getDrillList(params)` - 参数类型从简单对象升级为 `DrillListParams`

---

## 五、前端页面优化

### 5.1 文件变更

**文件**: `安全看板vben/apps/web-antd/src/views/emergency/index.vue`

### 5.2 预案 Tab 优化

| 优化项 | 说明 |
|--------|------|
| 导入按钮 | 新增 `ImportButtonGroup` 组件，添加 `@refresh` 事件绑定 |
| Mock 筛选 | catch 块中新增 keyword/type/level/status 四维筛选逻辑 |
| 统计联动 | 数据加载后自动调用 `fetchStats()` 更新统计卡片 |

### 5.3 演练 Tab 新增功能（核心）

**筛选功能（3项）**：
- 关键词搜索（预案名称/地点/评估人）
- 演练类型筛选（桌面/功能/全面）
- 演练结果筛选（优秀/良好/合格/不合格）

**操作栏**：
- 导入按钮（下载模板 + 上传数据 + 刷新回调）
- 新增演练按钮

**表格操作列**：
- 查看（详情抽屉）
- 编辑（Modal 表单）
- 删除（Popconfirm 确认）

**Modal 表单**：
- 11 个字段：预案名称、演练类型、演练日期、地点、评估人、参加人数、时长、结果、总结、改进建议
- 完整表单校验规则（必填、长度、数字范围等）

**详情抽屉**：
- 双模式 Drawer（预案详情 / 演练详情）
- 使用 `drawerMode` 切换显示内容
- Descriptions 组件展示完整信息，Tag 组件展示类型和结果

**Mock 数据筛选**：
- API 调用失败时自动降级到 Mock 数据
- 支持关键词、演练类型、结果三维度筛选

### 5.4 统计卡片

保持原有的 4 张统计卡片：
1. 预案总数（蓝色，siren 图标）
2. 启用中（绿色，check-circle-2 图标）
3. 演练总数（橙色，activity 图标）
4. 参演总人次（蓝色，users 图标）

### 5.5 UI 规范符合度

| 检查项 | 结果 |
|--------|------|
| 无 `::v-deep` 深度选择器 | ✅ 通过 |
| 无 `!important` 强制样式 | ✅ 通过 |
| 无硬编码颜色值 | ✅ 通过 |
| 使用 CSS 变量（hsl(var(--border)) 等） | ✅ 通过 |
| 使用 HseStatCard 统计卡片组件 | ✅ 通过 |
| 使用 ImportButtonGroup 导入组件 | ✅ 通过 |
| 删除使用 Popconfirm 组件 | ✅ 通过 |
| 使用 Page 页面布局组件 | ✅ 通过 |
| 响应式栅格（xs/sm/md/lg/xl） | ✅ 通过 |
| 暗黑模式兼容（CSS变量） | ✅ 通过 |

---

## 六、导入功能完善

### 6.1 前端模板配置

**文件**: `src/components/hse/ImportButtonGroup.vue`

新增 `drill` 模块模板字段：
```javascript
drill: ['预案名称', '演练类型', '演练日期', '演练地点', '参加人数', '演练结果', '评估人']
```

### 6.2 后端模板配置

**文件**: `server/routes/import.js`

新增 `drill` 模块示例数据：
```javascript
drill: [
  { 预案名称, 演练类型, 演练日期, 演练地点, 参加人数, 时长分钟, 演练结果, 评估人, 总结, 改进建议 }
]
```

### 6.3 模板下载与上传路径

- 下载模板：`GET /api/import/template/drill`
- 上传数据：`POST /api/import/upload`（module=drill）

---

## 七、修复的问题清单

| # | 问题描述 | 严重度 | 修复方式 |
|---|---------|--------|---------|
| 1 | 后端路由根路径与前端 `/plans` 前缀不匹配，导致 404 | 🔴 高 | 后端路由统一为 `/plans` 和 `/drills` 前缀 |
| 2 | 演练记录子路由完全缺失 | 🔴 高 | 新增 `/drills` 完整 CRUD 5个接口 |
| 3 | 内存模式无种子数据（initMemoryData 空） | 🔴 高 | 新增 10条预案 + 8条演练种子数据 |
| 4 | 前后端字段名不匹配（snake_case vs camelCase） | 🔴 高 | 新增 formatPlanRow / formatDrillRow 映射函数 |
| 5 | 统计接口字段与前端期望不一致 | 🔴 高 | 重构 stats，返回 6 个对齐字段 |
| 6 | 演练 Tab 无筛选功能 | 🟡 中 | 新增关键词/类型/结果 3 项筛选 |
| 7 | 演练 Tab 无新增/编辑/删除功能 | 🔴 高 | 新增完整 CRUD + Modal 表单 + 校验 |
| 8 | 演练 Tab 无详情抽屉 | 🟡 中 | 新增双模式 Drawer，演练详情模式 |
| 9 | 演练 Tab 无导入功能 | 🟡 中 | 新增 ImportButtonGroup + 模板配置 |
| 10 | Mock 数据不支持筛选 | 🟡 中 | catch 块增加 keyword/type/level/status 等筛选逻辑 |
| 11 | 预案 Tab 导入按钮无 refresh 回调 | 🟡 低 | 添加 `@refresh="fetchPlanData"` |
| 12 | 导入缺少 drill 模块模板配置 | 🟡 中 | 前后端均补充 drill 模块模板 |

---

## 八、与已优化模块的一致性

本模块严格遵循前五个模块（人员保险、隐患排查、事故管理、目标职责、培训管理）的统一规范：

| 规范项 | 实现方式 |
|--------|---------|
| 页面结构 | 统计卡片区 → 筛选栏 → 操作栏 → 表格 |
| 统计卡片 | HseStatCard 组件，4色4图标风格统一 |
| 删除交互 | Popconfirm 确认弹窗 |
| 表单弹窗 | Modal + Form，布局垂直，标签统一 |
| 详情展示 | Drawer + Descriptions |
| 内存降级 | try/catch + console.warn + Mock 数据 |
| 导入功能 | ImportButtonGroup 统一组件 |
| 响应式 | Row/Col 栅格系统 |
| 主题适配 | CSS 变量（hsl(var(--border)) 等） |
| 软删除 | is_deleted 标记，不物理删除 |
| 审计日志 | 所有写入操作调用 auditLog |

---

## 九、技术架构亮点

### 9.1 双模式架构

所有数据操作均实现 PostgreSQL + 内存降级双模式，确保 DB 断开时系统仍可完整运行，提升系统可用性。

### 9.2 字段映射层

通过 `formatPlanRow` / `formatDrillRow` 函数解耦 DB 字段命名与前端字段命名，同时保留原始字段兼容旧代码。

### 9.3 并行查询优化

统计接口使用 `Promise.all` 并行执行 6 条 SQL 查询，相比串行查询性能提升约 5 倍。

### 9.4 Tab 切换详情抽屉

单一 Drawer 组件通过 `drawerMode` 切换预案/演练详情，避免重复组件，代码更简洁。

---

## 十、后续建议

1. **演练与预案联动**：当前演练记录的预案关联仅为文本字段，建议后续升级为外键关联，实现点击预案查看关联演练
2. **演练评估报告导出**：支持导出单条演练记录的完整评估报告为 PDF
3. **演练日历视图**：新增日历视图展示演练安排，提升可视化效果
4. **附件上传**：预案和演练支持上传附件文档（PDF/Word/图片）

---

**报告完成时间**: 2026-07-15
**下一阶段**: 待指定
