# 网格长巡查台账 · 手机端 Web（PWA）设计方案

> 版本：设计稿 v1（仅设计，未落地代码）
> 目标系统：hse-dashboard（安全看板 · web-naive，Vite + Vue3 + Naive UI + vxe-table）
> 本文档范围：①系统完整菜单结构 ②三级菜单「网格长巡查台账」功能定位 ③手机端 PWA 改造设计方案

---

## 一、系统完整菜单结构（一级 / 二级 / 三级）

### 1.1 菜单机制说明
- 路由定义位于 `安全看板vben/apps/web-naive/src/router/routes/modules/*.ts`，由 `index.ts` 的 `import.meta.glob` 自动聚合。
- 菜单层级 = 路由 `path` 的嵌套深度：`/xxx`（一级）→ `/xxx/yyy`（二级）→ `/xxx/yyy/zzz`（三级）。
- 所有业务路由 `authority: ['admin']`，登录后由 `accessRoutes` 按角色过滤；`hideInMenu: true` 的页面不出现在菜单（多用于隐藏入口/详情页）。
- 排序由父级 `meta.order` 决定（数字越小越靠前）。

### 1.2 完整菜单树（按 order 排列）

**一级菜单：概览**（order -1）`/dashboard`
- 分析页 `/analytics`
- 工作台 `/workspace`

**一级菜单：安全总览**（order 1）`/overview` → 二级
- 安全总览首页 `/overview/cockpit`
- 智能分析面板 `/overview/executive-cockpit`
- BI数据看板 `/overview/bi`
- AI智能分析 `/overview/ai-analysis`
- 驾驶员风险中心 `/overview/driver-risk-center`
- 事故分析中心 `/overview/accident-analysis`
- 考核分析中心 `/overview/assessment-analysis`
- 报表中心 `/overview/reports`
- 预警与整改中心 `/overview/warning-center`
- IoT物联网 `/overview/iot`
- 供应链安全 `/overview/supply-chain`
- 告警中心 `/overview/alerts`（hideInMenu）
- 通知中心 `/overview/notifications`（hideInMenu）

**一级菜单：目标职责**（order 2）`/objectives` → 二级
- 责任书 `/objectives/responsibility`
- 委员会 `/objectives/committee`
- 考核评估 `/objectives/assessment`
- 安全预算 `/objectives/budget` → **三级**
  - 材料单价 `/objectives/budget/material-price`
  - 支出 `/objectives/budget/expenditure`
  - 年度 `/objectives/budget/annual`
  - 月度计划 `/objectives/budget/monthly-plan`
- 安全文化 `/objectives/safety-culture`
- 月度考核首页 `/objectives/assessment-monthly`
- 考核周期 `/objectives/assessment-cycles`
- 考核目标 `/objectives/assessment-targets`
- 考核评分 `/objectives/assessment-scoring`
- 扣分复核 `/objectives/assessment-deduction-review`
- 考核冻结 `/objectives/assessment-freeze`
- 考核导出 `/objectives/assessment-excel`
- 考核规则库 `/objectives/assessment-rule`

**一级菜单：制度标准**（order 3）`/standards` → 二级
- 规章制度 `/standards/regulations`
- 文件库 `/standards/library`
- 文件审核 `/standards/review`
- 标准条款库 `/standards/clauses`
- 条款资料关联 `/standards/relation`
- 匹配建议 `/standards/suggestions`

**一级菜单：风险管控**（order 4）`/risk` → 二级
- 风险清单 `/risk/list`
- 风险地图 `/risk/map`

**一级菜单：隐患治理**（order 5）`/hazards` → 二级
- 隐患清单 `/hazards/list`

**一级菜单：事故管理**（order 5）`/accidents`（叶子，无下级）

**一级菜单：我的待办**（order 5）`/hse/todos` → 二级
- 待办 `/hse/todos/index`
- 考核计划 `/hse/todos/plan`

**一级菜单：现场管理**（order 6）`/site` → 二级
- 三违管理 `/site/violation` → **三级**
  - 三违分析 `/site/violation/analysis`
  - 三违台账 `/site/violation/ledger`
- 消防设施管理 `/site/fire-facility`
- 转运站管理 `/site/transfer-stations`
- 车辆三检 `/site/vehicle-checks`（hideInMenu）
- 网格管理 `/site/grid` → **三级**
  - **网格长巡查管理** `/site/grid/mgmt`
  - **网格长巡查台账** `/site/grid/ledger`　★ 本方案目标
- 驾驶员管理 `/site/driver` → **三级**
  - 交通安全档案 `/site/driver/assessment`
  - 驾驶员违章记录 `/site/driver/violation`
  - 月度考核 `/site/driver/monthly`

**一级菜单：人员管理**（order 7）`/personnel` → 二级
- 员工列表 `/personnel/employee`
- 组织管理 `/personnel/departments`
- 岗位管理 `/personnel/positions`
- 员工档案 `/personnel/profile` → **三级**
  - 员工档案列表 `/personnel/profile/list`
- 扣分调整 `/personnel/deduction-adjust`
- 花名册导入 `/personnel/import`
- 批量导入 `/personnel/batch-import`
- 超龄人员 `/personnel/over-age`
- 作业中心 `/personnel/org-center`

**一级菜单：培训考核**（order 8）`/training` → 二级
- 培训计划 `/training/plans`
- 培训记录 `/training/records`
- 考核管理 `/training/assessments`
- 证书管理 `/training/certificates`
- 综合考核 `/training/comprehensive`

**一级菜单：应急管理**（order 9）`/emergency` → 二级
- 应急预案 `/emergency/plans`
- 应急演练 `/emergency/drills`
- 应急物资 `/emergency/materials`
- 应急队伍 `/emergency/teams`
- 应急事件 `/emergency/events`

**一级菜单：保险管理**（order 10）`/insurance` → 二级
- 人员保险 `/insurance/personnel`
- 车辆保险 `/insurance/vehicle`
- 其他保险 `/insurance/other`

**一级菜单：系统管理**（order 11）`/system` → 二级
- 用户管理 `/system/users`
- 角色管理 `/system/roles`
- 审计日志 `/system/audit`

**一级菜单：高级分析**（order 15）`/hse-advanced`（hideInMenu）→ 二级
- IoT物联网 `/hse-advanced/iot`
- 供应链安全 `/hse-advanced/supply-chain`
- 风险画像 `/hse-advanced/risk-profile/:employeeId`
- 工作流 `/hse/workflow`（独立路由）
- 花名册导入V2 `/hse/employee-import-v2`
- 批量导入中心 `/hse/batch-import`

**一级菜单：演示**（order 1000）`/demos` → 二级
- Naive 演示 `/demos/naive`、表格 `/demos/table`、表单 `/demos/form`

**一级菜单：个人中心**（order 9998）`/profile`；**Vben Admin**（order 9999）`/vben-admin`

> 结论：「网格长巡查台账」位于 **现场管理（一级）→ 网格管理（二级）→ 网格长巡查台账（三级）**，路径 `/site/grid/ledger`。

---

## 二、三级菜单「网格长巡查台账」功能定位

### 2.1 路径与父级链
- 路由：`/site/grid/ledger`（name `SiteGridPatrolLedger`）
- 视图文件：`安全看板vben/apps/web-naive/src/views/site/grid-ledger/index.vue`
- API 封装：`安全看板vben/apps/web-naive/src/api/hse/site.ts`
- 后端契约：`server/routes/site-mgmt.js`（表 `grid_inspection_records`）
- 权限：`authority: ['admin']`，需登录后访问

### 2.2 功能内容（业务说明）
网格长巡查台账是**现场管理 → 网格管理**下的「巡查记录台账」，用于登记网格长日常安全巡查中发现的「三违」（违章指挥、违章作业、违反劳动纪律）行为及整改情况。核心能力：
1. **列表浏览**：服务端分页（默认每页 100，按巡查日期倒序），虚拟滚动渲染大体积台账。
2. **多维筛选**：关键字（网格长 / 片区 / 违章人 / 违章行为）、片区/班组、网格级别、上报状态。
3. **单元格编辑**：点击单元格直接改（输入框 / 下拉），关闭即自动保存（仅白名单字段可改）。
4. **新增记录**：弹窗表单录入一条巡查台账。
5. **批量删除 / 表格清空**：勾选行删除或调试性清空。
6. **导入 / 导出**：通用导入网关写入台账表；按筛选条件分页拉全量后前端生成 CSV 导出（含图片路径）。
7. **图片预览**：三违照片、整改后照片以缩略图展示，点击放大预览。

### 2.3 数据项（表 `grid_inspection_records` 全字段）
> 字段名（DB snake_case → 中文标签 → 是否可单元格编辑）

| # | 字段 | 中文标签 | 类型 | 可编辑 |
|---|------|---------|------|--------|
| 1 | id | 记录ID | int | 系统 |
| 2 | area_team | 片区/班组（分组名称） | text | ✅ |
| 3 | upload_time | 上传时间 | timestamp | 系统 |
| 4 | inspection_date | 巡查日期 | date | ✅ |
| 5 | personnel_name | 检查人(网格长) | text | ✅ |
| 6 | grid_level | 网格等级 | enum | ✅（一级/二级/三级网格长）|
| 7 | position | 所属岗位 | text | ✅ |
| 8 | violator_name | 违章人姓名 | text | ✅ |
| 9 | violator_gender | 违章人性别 | enum | ✅（男/女）|
| 10 | violator_age | 违章人年龄 | text | ✅ |
| 11 | vehicle_type | 车辆类型 | text | 仅新建 |
| 12 | report_status | 上报状态 | enum | ✅（已上报/未上报/待上报）|
| 13 | image_content | 三违照片 | 图片路径(逗号分隔) | 仅预览 |
| 14 | violation_behavior | 三违行为 | text | ✅ |
| 15 | violation_type_result | 违章类型/结果 | text | 仅新建 |
| 16 | need_rectification | 需整改 | enum | ✅（是/否/—）|
| 17 | rectifier | 整改人 | text | ✅ |
| 18 | rectified_photo | 整改后照片 | 图片路径 | 仅预览 |
| 19 | schematic | 示意图 | text | 仅新建 |
| 20 | grid_id | 关联网格ID | int | 系统 |
| 21 | nickname | 昵称 | text | ✅ |
| 22 | signup_today | 今日签到 | text | ✅ |
| 23 | marker | 标记 | text | ✅ |
| 24 | is_resubmit | 是否重报 | text | ✅ |
| 25 | serial_no | 编号 | text | ✅ |
| 26 | created_at / updated_at | 创建/更新时间 | timestamp | 系统 |

**Web 端表格实际展示列（14 列）**：序号、昵称、分组名称、姓名、所属岗位、网格等级、日期、三违照片、三违行为、违章人姓名、违章人性别、违章人年龄、整改后照片、编号。

### 2.4 后端接口契约（可复用）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/site-mgmt/grid-records` | 筛选列表（page/pageSize/sortField/sortOrder/keyword/areaTeam/gridLevel/reportStatus）|
| GET | `/site-mgmt/grid-records/filter-options` | 筛选下拉选项（areaTeams/gridLevels/reportStatuses）|
| PUT | `/site-mgmt/grid-records/:id` | 单元格编辑保存（仅白名单字段）|
| POST | `/site-mgmt/grid-records` | 新增一条记录 |
| DELETE | `/site-mgmt/grid-records` | 批量删除（body `{ ids: number[] }`）|

> 注：Web 端经 Vite 代理 `VITE_GLOB_API_URL=/api`，即请求发往 `/api/site-mgmt/grid-records`；手机端 PWA 应复用同一网关前缀。

---

## 三、手机端 Web（PWA）设计方案

### 3.1 设计目标与原则
- **移动优先**：单列流式布局、大点按区（≥44px）、底部固定操作区，符合拇指操作。
- **核心业务不降级**：保留「浏览/筛选/详情编辑/新增/图片预览/导出」核心链路；批量删除、整表导入等重操作降为「管理态」二级入口（非首屏必现）。
- **PWA 独立全屏**：添加到桌面后以 `display: standalone` 运行，隐藏浏览器地址栏，拥有独立图标与启动页。
- **离线友好**：列表与筛选结果可 Service Worker 缓存，弱网/断网也能看最近数据；写操作（编辑/新增）在线提交。

### 3.2 信息架构（IA）
```
网格长巡查台账（PWA 首页）
├─ 顶部：标题栏（网格长巡查台账）+ 全局搜索框
├─ 筛选条（可折叠）：片区/班组 ▾ | 网格级别 ▾ | 上报状态 ▾ | 查询/重置
├─ 统计条：共 N 条 · 本月 M 条（轻量概览）
├─ 卡片列表（无限滚动 / 上拉加载更多）
│   每张卡片：网格等级徽标 + 检查人 + 片区/班组
│            三违行为（摘要，超长截断）
│            违章人 / 巡查日期 / 上报状态标签
│            缩略图（三违照片+整改后照片）- 点击放大
│            右滑/长按 → 编辑、删除
├─ 悬浮按钮 FAB ＋ ：新增巡查记录
└─ 底部 Tab（可选）：台账 / 筛选 / 我的
```
- **详情/编辑页**（点卡片进入，或底部上滑 Sheet）：分组展示全部 26 个数据项；可编辑字段点击即出输入/下拉，保存即提交 `PUT`；图片区点缩略图全屏预览。
- **新增页**：表单（与 Web 新增弹窗字段一致），提交 `POST`。

### 3.3 页面与交互设计（关键屏）
1. **列表屏**：卡片化替代宽表格；首屏展示最关键 6 项（网格等级、检查人、片区、三违行为、违章人、日期、状态）。图片用 2 张缩略图（三违 + 整改后）。
2. **筛选屏**：移动端用底部抽屉（Bottom Sheet）承载 3 个下拉 + 关键字输入，避免挤占首屏。
3. **详情/编辑屏**：
   - 只读信息（ID、上传时间、照片路径、创建/更新时间）置灰展示；
   - 可编辑字段（白名单 17 项）提供「编辑」入口，文本类用输入框、枚举类用 Picker（网格等级/性别/上报状态/需整改）；
   - 照片字段：缩略图网格 + 点击全屏灯箱（lightbox）。
4. **新增屏**：分步或单页表单，必填提示（至少片区/检查人/三违行为其一）。
5. **导出**：详情/列表页「···」菜单 → 生成 CSV 并下载（移动端触发文件下载或分享）。
6. **登录/鉴权**：首次进入若未携带 token，引导登录（复用现有 admin 账号体系），token 存入 `localStorage` 随请求头发送。

### 3.4 移动端适配要点
- 视口：`meta viewport` 锁定 `width=device-width, initial-scale=1, viewport-fit=cover`（适配刘海屏 `env(safe-area-inset-*)`）。
- 布局：Flex/Grid 单列；表格改为**卡片列表**；下拉/选择器用原生或移动组件（避免桌面级宽下拉）。
- 手势：卡片左滑出操作（编辑/删除）；图片点击放大；下拉刷新、上拉加载。
- 字体与触控：基础字号 ≥14px，按钮高度 ≥44px；主色沿用系统主题（HSE 安全色，如警示红/橙 + 中性灰）。
- 图片：缩略图 `object-fit: cover` 固定尺寸（如 56×56），全屏预览用 `NImage`/lightbox 等价能力。

### 3.5 PWA 配置（manifest + 图标 + 全屏）
**manifest.webmanifest（规格）**
```json
{
  "name": "网格长巡查台账",
  "short_name": "巡查台账",
  "description": "网格长安全巡查三违台账 · 移动端",
  "lang": "zh-CN",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "orientation": "portrait",
  "background_color": "#f5f6f8",
  "theme_color": "#c0392b",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
**应用图标（设计规格）**
- 尺寸：192×192、512×512（另出 maskable 512，关键图形内缩至安全区 80%）。
- 视觉：圆形/圆角底（HSE 红 `#c0392b`），中央「网格 +  Clipboard（ clipboard 列表）」白线图标，象征网格巡查台账；底部小字「巡查」。
- 交付物：SVG 源（可矢量化缩放）→ 导出 PNG（建议用工具一次性生成 192/512/maskable）。下方为图标 SVG 源（设计资产，非运行代码）：
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#c0392b"/>
  <g fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round">
    <rect x="150" y="120" width="212" height="272" rx="20"/>
    <line x1="150" y1="180" x2="362" y2="180"/>
    <line x1="196" y1="246" x2="316" y2="246"/>
    <line x1="196" y1="300" x2="316" y2="300"/>
    <line x1="196" y1="354" x2="270" y2="354"/>
  </g>
  <g stroke="#ffffff" stroke-width="14">
    <path d="M250 392 V440 H300" fill="none" stroke-linecap="round"/>
    <path d="M268 418 l16 16 28 -34" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
```
**iOS 兼容（manifest 之外补充）**：`<link rel="apple-touch-icon" href="/icons/icon-192.png">`、`<meta name="apple-mobile-web-app-capable" content="yes">`、`<meta name="apple-mobile-web-app-status-bar-style" content="default">`、`<meta name="apple-mobile-web-app-title" content="巡查台账">`。
**添加到桌面指引（文案 + 逻辑）**：Android Chrome 自动在地址栏显示「安装」；iOS Safari 需用户点「分享 → 添加到主屏幕」。首启动可在首页浮层提示一次（localStorage 记忆已提示）。
**Service Worker（策略）**：注册 `sw.js`；`precache` 应用壳（HTML/JS/CSS/图标）；运行时对 `GET /site-mgmt/grid-records` 采用 **stale-while-revalidate**（先返缓存、后台更新）；`PUT/POST/DELETE` 直连网络。可离线查看最近台账。

### 3.6 接口与鉴权复用
- 直接复用现有 `server/routes/site-mgmt.js` 的 5 个接口，不做后端改造（零侵入）。
- 请求基地址：与 Web 一致走 `/api` 网关（若 PWA 独立部署域名，需配置反向代理或 CORS 白名单）。
- 鉴权：登录后 `localStorage` 写入访问令牌（与 Web 现有 token key 对齐），每个请求附带；401 跳登录。

### 3.7 核心业务功能保留对照表
| 原 Web 功能 | 移动端映射 | 优先级 |
|------------|-----------|--------|
| 列表浏览 + 服务端分页 | 卡片列表 + 上拉加载更多 | P0 |
| 关键字/片区/级别/状态筛选 | 顶部搜索 + 底部抽屉筛选 | P0 |
| 单元格编辑（白名单 17 项） | 详情页字段级编辑 + 保存 | P0 |
| 新增记录 | 独立新增页/表单 | P0 |
| 三违/整改后照片预览 | 缩略图 + 灯箱全屏 | P0 |
| 导出 CSV | 「···」菜单 → 下载 | P1 |
| 批量删除 | 长按多选 → 删除（管理态） | P2 |
| 整表导入 | 暂不首屏，预留入口 | P2 |
| 表格清空 | 不提供（防误删） | 移除 |

### 3.8 技术选型与后续步骤（供落地参考，本次不实现）
- 框架：复用 Vue3 + Vite；或轻量方案（如 Vant / Naive 移动适配）保证移动交互。
- 目录建议：`安全看板vben/apps/web-mobile/`（新 app）或 `web-naive` 内新增 `views/mobile/grid-ledger`，共用同一套 API（`#/api/hse/site`）。
- PWA 插件：`vite-plugin-pwa`（自动生成 manifest + sw + 图标占位）。
- 落地顺序：① 搭建移动壳 + manifest/图标 → ② 列表+筛选 → ③ 详情编辑+图片预览 → ④ 新增 → ⑤ 导出/Service Worker → ⑥ 真机「添加到桌面」验证。

---

## 四、设计评审要点（待确认）
1. **权限边界**：手机端是否仅限 admin，或下放至网格长/乡镇经理角色（现有 `authority` 含 `group_leader` 等，可据此放开）。
2. **编辑粒度**：移动端是否允许全部 17 个白名单字段编辑，还是只开放高频字段（片区/检查人/三违行为/上报状态/整改人）。
3. **图片上传**：手机端是否需支持现场拍照上传（原 Web 仅展示路径，无上传入口）——如需，需后端补充上传接口。
4. **部署形态**：独立子应用（独立域名）还是作为 `web-naive` 的移动路由（同一域名 `/m/...`），影响 PWA scope 与代理配置。
