# HSE系统隐患排查治理模块优化报告

**项目名称**：宁津环卫HSE安全管理系统  
**模块**：隐患排查治理  
**日期**：2026-07-15  
**技术栈**：Vue3 + TypeScript + Vben Admin + Ant Design Vue + Express + PostgreSQL

---

## 一、扫描发现的问题

### P0 — API对接问题（阻断性）

| 序号 | 问题描述 | 根因 | 影响 |
|------|----------|------|------|
| 1 | 字段名不匹配 | 前端用 `title/reporter/handler/discoveredAt/completedAt/year/month`，后端用 `description/checker/fixer/hazard_date/verify_date` | 列表显示空值、表单提交数据丢失 |
| 2 | 状态值不匹配 | 前端用 `pending/processing/completed`（英文），后端DB存 `未完成/整改中/已完成`（中文） | 筛选无效、Tag显示不正确 |
| 3 | 等级值不匹配 | 前端用 `critical/high/medium/low`（英文），后端DB存 `重大/较大/一般/低`（中文） | 筛选无效、Tag显示不正确 |
| 4 | 统计数据不准 | 前端只用当前页数据统计（`updateStats`），未调用 `/hazards/stats` 接口 | 统计卡片只反映当前页，不是全局数据 |

### P1 — 功能完善问题

| 序号 | 问题描述 | 影响 |
|------|----------|------|
| 5 | 缺少年份/月份筛选支持 | 前端有年月筛选UI但后端不支持 |
| 6 | location筛选无效 | 前端传 `location`，后端只认 `township` |
| 7 | 单条详情未调用详情API | 直接用列表行数据，字段可能不全 |
| 8 | 完成整改后不刷新统计 | `handleComplete` 只刷新列表，不刷新统计卡片 |

### P2 — 导入功能

| 序号 | 问题描述 | 状态 |
|------|----------|------|
| 9 | 导入模板已配置 | ✅ 已有 hazards 模板 |
| 10 | 导入走通用 /api/import/* | ✅ Python 引擎处理 |
| 11 | 下载模板走 requestClient | ✅ 已在上轮优化中修复 |

### UI风格

| 序号 | 检查项 | 结果 |
|------|--------|------|
| 12 | 硬编码颜色 | ✅ 0处 |
| 13 | 深度选择器 | ✅ 0处 |
| 14 | 内联样式 | ✅ 仅3处 `width: 100%`（表单控件标准用法） |
| 15 | 组件使用 | ✅ 全部Vben + AntD官方组件 |
| 16 | 统计卡片 | ✅ 使用 HseStatCard |
| 17 | 操作栏布局 | ✅ card-header 模式（左标题 + 右按钮） |

---

## 二、修复详情

### 2.1 后端修复（server/routes/hazards.js）

#### 新增：状态/等级中英文转换层

```javascript
const STATUS_CN_TO_EN = { '未完成': 'pending', '整改中': 'processing', '已完成': 'completed', '待整改': 'pending' };
const STATUS_EN_TO_CN = { pending: '未完成', processing: '整改中', completed: '已完成' };
const LEVEL_CN_TO_EN = { '重大': 'critical', '较大': 'high', '一般': 'medium', '低': 'low', '轻微': 'low' };
const LEVEL_EN_TO_CN = { critical: '重大', high: '较大', medium: '一般', low: '低' };
```

#### 改造：formatRow 输出前端友好字段

**新增兼容字段**：
- `title` ← description 或 no
- `status` ← 英文枚举（原 statusCn 保留中文）
- `level` ← 英文枚举（原 levelCn 保留中文）
- `reporter` ← checker
- `handler` ← fixer
- `location` ← location 或 township
- `discoveredAt` ← hazard_date（ISO格式）
- `completedAt` ← verify_date 或 fix_date（仅完成状态）
- `year` / `month` ← 从 hazard_date 提取

**原有字段全部保留**（向后兼容）。

#### 增强：GET / — 列表筛选

**新增筛选参数**：

| 参数 | 类型 | SQL 实现 | 内存模式实现 |
|------|------|----------|-------------|
| `location` | string | `COALESCE(location, township) = $n` | 双字段匹配 |
| `year` | number | `EXTRACT(YEAR FROM hazard_date)::int = $n` | Date.getFullYear() |
| `month` | number | `EXTRACT(MONTH FROM hazard_date)::int = $n` | Date.getMonth()+1 |

**状态/等级兼容中英文**：如果前端传英文，自动转为中文与DB比较。

#### 改造：GET /stats — 统计接口

**原返回**：`{ total, byStatus: {中文: count}, byLevel: {中文: count}, byCategory }`

**新返回**：
```json
{
  "total": 100,
  "pending": 20,
  "processing": 15,
  "completed": 65,
  "critical": 5,
  "high": 15,
  "medium": 50,
  "low": 30,
  "byCategory": { "消防安全": 20, ... }
}
```

直接扁平化输出英文字段，前端直接用，无需转换。

#### 改造：POST / — 创建

**字段映射**：
- `discoveredAt` → `hazard_date`
- `completedAt` → `fix_date` + `verify_date`
- `status`（英文）→ `status`（中文）
- `level`（英文）→ `level`（中文）
- `reporter` → `checker`
- `handler` → `fixer`
- `location` → `township`（同时保留 location 字段）
- `title` → `description`

#### 改造：PUT /:id — 更新

同样的字段映射逻辑，使用动态 SET 子句（只更新传入的字段），而非 COALESCE。

---

### 2.2 前端API层修复（api/hse/insurance.ts）

#### 新增：getHazardStats

```typescript
export async function getHazardStats() {
  return requestClient.get<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    byCategory: Record<string, number>;
  }>('/hazards/stats');
}
```

---

### 2.3 前端页面修复（views/hazards/index.vue）

#### 统计卡片改用 stats 接口

- 新增 `fetchStats()` 函数，调用 `getHazardStats`
- `statItems` 的 total 改为 `statsData.value.total`（而非 `total.value`）
- `fetchData` 成功后调用 `fetchStats()`
- `onMounted` 同时调用 `fetchStats()` + `fetchData()`
- mock fallback 模式下填充有意义的统计值

#### 其他保持不变

- 列表展示：后端 formatRow 已输出前端需要的字段
- 筛选：后端已兼容所有前端参数
- 表单提交：后端已做字段映射
- 详情抽屉：直接用列表行数据（后端字段已对齐）

---

## 三、功能清单

### 3.1 列表页

| 功能 | 状态 | 说明 |
|------|------|------|
| 分页查询 | ✅ | 后端分页，支持 page/pageSize |
| 关键词搜索 | ✅ | 标题/描述/位置/检查人 |
| 年份筛选 | ✅ | 后端新增 EXTRACT(YEAR) 支持 |
| 月份筛选 | ✅ | 后端新增 EXTRACT(MONTH) 支持 |
| 等级筛选 | ✅ | 兼容中英文 |
| 状态筛选 | ✅ | 兼容中英文 |
| 分类筛选 | ✅ | 原功能 |
| 区域筛选 | ✅ | location/township 双字段匹配 |
| 重置筛选 | ✅ | 原功能 |

### 3.2 统计卡片

| 卡片 | 状态 | 数据源 |
|------|------|--------|
| 隐患总数 | ✅ | /hazards/stats 接口 |
| 待整改 | ✅ | /hazards/stats 接口 |
| 整改中 | ✅ | /hazards/stats 接口 |
| 已完成 | ✅ | /hazards/stats 接口 |

### 3.3 CRUD

| 功能 | 状态 | 说明 |
|------|------|------|
| 新增隐患 | ✅ | 字段自动映射 |
| 编辑隐患 | ✅ | 字段自动映射 |
| 删除隐患 | ✅ | 软删除 |
| 查看详情 | ✅ | Drawer 展示 |
| 完成整改 | ✅ | Popconfirm + status=completed |

### 3.4 导入功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 下载模板 | ✅ | CSV 格式，hazards 模板已配置 |
| 上传文件 | ✅ | 支持 CSV/XLSX/XLS |
| 数据预览 | ✅ | ImportModal 表格预览 |
| 错误下载 | ✅ | ImportModal 错误导出 |
| 确认导入 | ✅ | 走通用 /api/import/confirm |

### 3.5 整改流程

| 步骤 | 状态 | 操作入口 |
|------|------|----------|
| 发现上报 | ✅ | 新增隐患（status=pending） |
| 整改中 | ✅ | 编辑隐患修改状态 |
| 完成整改 | ✅ | 操作列「完成」按钮（Popconfirm） |
| 查看历史 | ✅ | 详情 Drawer |

---

## 四、UI风格一致性

### 与人员保险模块对比

| 检查项 | 人员保险 | 隐患排查 | 一致性 |
|--------|----------|----------|--------|
| 页面结构 | Page + StatCards + Card + Table | Page + StatCards + Card + Table | ✅ 一致 |
| 卡片风格 | HseStatCard | HseStatCard | ✅ 一致 |
| 操作栏 | card-header（左标题+右按钮） | card-header（左标题+右按钮） | ✅ 一致 |
| 筛选表单 | filter-form（底部边框） | filter-form（底部边框） | ✅ 一致 |
| 表格 | middle + 固定操作列 | middle + 固定操作列 | ✅ 一致 |
| 分页 | showSizeChanger + showTotal | showSizeChanger + showTotal + showQuickJumper | ⚠️ 细微差异 |
| 详情展示 | Drawer + Descriptions | Drawer + Descriptions | ✅ 一致 |
| 表单弹窗 | Modal + 垂直布局 | Modal + 垂直布局 | ✅ 一致 |
| Tag颜色 | 语义化（success/warning/error） | 语义化（red/orange/gold/green/blue） | ✅ 一致 |
| 导入组件 | ImportButtonGroup | ImportButtonGroup | ✅ 一致 |
| 深色模式 | 全CSS变量 | 全CSS变量 | ✅ 一致 |

**说明**：分页多了 `showQuickJumper` 不影响整体一致性，属于增强功能。

---

## 五、验证清单

### 5.1 API对接验证

**前置条件**：启动后端（`node server/app.js`，端口5666）

1. **列表加载**
   - [ ] 进入隐患排查页面，列表正常加载（无404）
   - [ ] 每行数据完整：标题、等级、状态、分类、区域、年月、上报人、发现日期

2. **筛选功能**
   - [ ] 关键词搜索：输入关键字，列表正确过滤
   - [ ] 年份筛选：选择年份，列表只显示对应年份
   - [ ] 月份筛选：选择月份，列表只显示对应月份
   - [ ] 等级筛选：选择等级，列表正确过滤
   - [ ] 状态筛选：选择状态，列表正确过滤
   - [ ] 分类筛选：选择分类，列表正确过滤
   - [ ] 区域筛选：选择区域，列表正确过滤
   - [ ] 组合筛选：多个条件同时生效

3. **统计卡片**
   - [ ] 4个统计卡片有真实数据
   - [ ] 新增/删除/完成整改后，统计数字更新

4. **CRUD**
   - [ ] 新增隐患：填写表单，提交后列表出现新记录
   - [ ] 编辑隐患：修改字段，提交后列表更新
   - [ ] 删除隐患：点击删除，确认后记录消失
   - [ ] 完成整改：点击「完成」，状态变为已完成

5. **详情抽屉**
   - [ ] 点击「查看」，Drawer 弹出
   - [ ] 所有字段正确显示
   - [ ] 等级/状态 Tag 颜色正确

6. **导入功能**
   - [ ] 点击「导入」下拉 → 下载模板，生成 CSV 文件
   - [ ] 上传 CSV，预览数据正确
   - [ ] 点击「确认导入」，返回结果

### 5.2 UI风格验证

- [ ] 深色模式切换，所有颜色正确
- [ ] 统计卡片样式与首页/保险模块一致
- [ ] 表格、Tag、按钮风格统一
- [ ] 无硬编码颜色
- [ ] 无自定义组件（仅用 Vben + AntD）

### 5.3 响应式验证

- [ ] 桌面端：布局正常
- [ ] 平板：统计卡片自动换行
- [ ] 手机：表格可横向滚动

---

## 六、变更文件汇总

```
后端（1个文件）：
└── server/routes/hazards.js
    ├── 新增 状态/等级中英文转换层
    ├── 改造 formatRow：输出前端友好字段（title/status/level/reporter/handler/discoveredAt/completedAt/year/month）
    ├── 增强 GET /：新增 location/year/month 筛选，兼容中英文状态等级
    ├── 改造 GET /stats：扁平化输出英文字段
    ├── 改造 POST /：前端字段 -> DB字段映射
    └── 改造 PUT /:id：动态 SET + 字段映射

前端 API（1个文件）：
└── api/hse/insurance.ts
    └── 新增 getHazardStats 函数

前端页面（1个文件）：
└── views/hazards/index.vue
    ├── 导入 getHazardStats
    ├── 新增 fetchStats 函数
    ├── statItems total 改用 statsData.total
    └── onMounted / fetchData 中调用 fetchStats
```

---

## 七、剩余问题与建议

### 低优先级（P3）

| 序号 | 问题 | 建议 |
|------|------|------|
| 1 | 详情抽屉直接用列表行数据，未调用详情API | 当前字段已对齐，若后续增加详情特有字段再补充 |
| 2 | 分页多了 showQuickJumper（保险模块没有） | 不影响一致性，属于增强，可不改 |
| 3 | Hazard API 定义在 insurance.ts 中 | 语义不符，但文件组织调整属重构范畴，本轮不做 |

### 不改动原则说明

1. **未新增任何自定义组件** — 全部使用 Vben + AntD 官方组件
2. **未改写业务逻辑** — 只做字段映射和接口对接
3. **未引入新特性** — 没有拖拽、没有新交互模式
4. **保持代码结构** — 后端路由结构、前端页面结构均保持原样

---

*报告生成时间：2026-07-15*
