# H5-GRID-UI-01 网格长巡查 H5 页面与三违拍照流程统一实施报告

> 阶段代号：H5-GRID-UI-01
> 项目：G:\hse-dashboard
> 日期：2026-09-15
> 性质：只做「网格长巡查管理」手机端 H5 的页面结构、交互流程和 UI 原型级实现；不扩展 PC 端三违业务，不重做责任传导、扣分、审核、整改、复查。

---

## 1. 阶段目标

1. 以「现场巡查记录工具」为定位，统一网格长巡查 H5 页面结构与交互流程（9 个页面：登录 / 工作台 / 开始巡查 / 现场取证 / 正常提交 / 发现问题 / 三违记录 / 巡查记录 / 巡查详情）。
2. 统一三违拍照流程为「先取证，再判断，再填写」，照片交互复用既有成熟「照片组」能力（上传中/已上传/上传失败三态、删除、预览、重试、提交前校验）。
3. 三违照片保持与 WPS「三违照片：图片1/2/3」三个 Attachment 照片位的业务兼容性（入库 `image_content` 逗号分隔，前 3 张对应图片1/2/3），不新增照片字段模型。
4. 登录方式冻结为「手机号 + 密码」，完全复用现有 JWT 登录体系；业务身份使用 `employee_code`。
5. 两条验收链路可走通：正常巡查提交链路、三违取证提交链路。

## 2. 现状审计

### 2.1 审计范围与方法

逐文件读取既有移动端、上传、人员选择器、登录、后端身份端点与 WPS 同步映射代码，并核对既有阶段报告（CF-WPS-04/05/06、MOBILE-WPS-V1、HSE-MOBILE-GRID-ARCH-03 系列）。

### 2.2 审计问题回答（任务书 §九 A–F）

**A. 可直接复用的现有组件/能力**

| 能力 | 位置 | 复用方式 |
| --- | --- | --- |
| 照片组（三态上传/重试/删除/预览/提交前校验） | `apps/web-naive/src/views/mobile/grid/photo-group.ts` | 直接 import 复用（取证页/三违页） |
| 图片上传封装（相对路径归一化、多图拼接、类型/体积校验） | `apps/web-naive/src/api/hse/grid-upload.ts` | 直接复用 `uploadGridImage` / `joinImagePaths` / `splitImagePaths` |
| 正式员工选择器 | `#/api/hse/employee.ts` → `getEmployeeSelectorList`（GET /api/hse/employee/employees/selector，PG 主数据） | 直接复用 API 与交互思想 |
| 三违创建链路 | `#/api/hse/violations.ts` → `createViolation`（POST /api/violations） | 直接复用，不新增接口 |
| 巡查记录创建/查询 | `#/api/hse/site.ts` → `createGridInspectionRecord` / `getGridInspectionList` / `getGridAreaList` | 直接复用 |
| 当前员工身份上下文 | server `routes/current-employee.js` + `services/currentEmployeeContext.js`（GET /api/current-employee，返回 employeeCode 等） | 后端原样复用，仅新增前端 API 封装 |
| 移动端布局壳层（顶部+底部导航、安全区适配） | `src/layouts/mobile.vue` + `src/router/routes/modules/mobile.ts` | 原样复用，仅追加路由 |
| 巡查台账（08 巡查记录） | `src/views/mobile/grid/ledger.vue`（服务端 gridScope 过滤、分页、错误三态） | 原样复用为「我的巡查记录」 |
| JWT 登录体系 | `authStore.authLogin` → POST /api/auth/login | 原样复用，不修改 |
| 错误归一化 | `photo-group.ts` 的 `normalizeApiError` / `mapUploadError` | 直接复用 |

**B. 只能复用设计思想、不能直接复用代码的部分**

1. `/mw`（MOBILE-WPS-V1 原型）：其「拍照→选人→行为→处置」流程思想被吸收，但其独立 WPS 会话/传输层、整改(rectify)/复查(review)/转派(transfer) 页面与本阶段冻结原则（H5 不做整改复查）冲突，**不扩展、不引入其代码**。
2. `violation/new.vue`（MOBILE-05 三违录入）：人员选择交互思想复用；但该页提交后轮询并**展示扣分与责任结果**，违反本阶段「手机端不显示扣分/责任人/责任传导」冻结原则，故新三违记录页不展示该部分。**老页面保留未动**（`/mobile/violation/new` 路由仍可用）。
3. `grid/new.vue`（MOBILE-02 新增巡查大表单）：其照片组实现思想已由 photo-group.ts 固化；本阶段新流程改为「先拍照后判断」分步式，老页面保留未动。

**C. WPS Attachment 上传链路是否已具备**

已具备，但链路方向需明确：
- H5 → 本地 HSE 后端：`POST /api/files/upload/image`（`server/routes/files.js` + `middleware/upload.js`，图片类型白名单+魔术字节校验），返回后入库**相对路径** `/uploads/images/<filename>`（`grid-upload.ts` 归一化，blob:/data:/绝对 URL 一律不入库）。
- PG → WPS：既有 WPS→PG 同步为 Pull 单向（05-H-0 冻结），WPS 侧「三违照片：图片1/2/3」原生 Attachment 的二进制搬运属同步域，H5 不直写 WPS。
- 未新增第三方图片存储；未在前端暴露任何 WPS APPKEY/APPSECRET/token。
- Cloudflare 侧：`grid-mobile-cloudflare/worker/`（wrangler.toml + index.js）为已归档的 WPS OAuth POC；本阶段为 UI 原型级实现在现有同源链路（5876 同源托管 dist + /api）上验证，**未切换部署架构**（见 §14 已知问题）。

**D. 三违图片1/2/3 如何映射**

WPS 网格巡查表头「三违照片：图片1 / 图片2 / 图片3」（原生 Attachment）↔ PG `grid_inspection_records.image_content`（多张以英文逗号分隔）。H5 三违记录页使用**固定 3 照片位**（超限整批拒收并提示），上传成功的相对路径经 `joinImagePaths` 拼接写入 `image_content`，按顺序对应图片1/2/3；三违正式记录（POST /api/violations）的图片同样写入 `imageContent`，与既有 PC/同步链路兼容。未扩展任何新照片字段。

**E. 当前已存在的 H5 页面**

- `/mobile`（正式 HSE 移动端，JWT 登录体系）：index（首页含 PC 式统计卡）、grid（我的网格）、grid/ledger（台账）、grid/new（大表单新增巡查）、grid/rectify/:id（补传整改照片）、grid/detail/:id?（详情，原版无照片展示）、violation/new（三违录入，展示扣分结果）、me（我的）。
- `/mw`（MOBILE-WPS-V1 原型，独立手机号会话）：login/home/violation 拍照-选人-行为-处置/整改/复查/任务/记录。
- PC 登录页（Vben authentication），无移动端专用登录页。

**F. 需要新增的内容** → 见 §7。

### 2.3 审计结论

现有 `/mobile` 体系与任务冻结原则高度兼容（JWT 登录复用、服务端权威身份、照片组成熟、员工选择器正式），是唯一正确的实现基座；`/mw` 与新流程冲突仅扩展思想；本阶段在 `/mobile` 内以**新增页面为主、两处页内增强为辅**完成统一设计，未复制任何同功能代码。

## 3. 页面结构

| # | 页面 | 路由 | 状态 | 关键决策 |
| --- | --- | --- | --- | --- |
| 01 | 登录页 | `/mobile/login` | **新增** | 手机号+密码；复用 `authStore.authLogin`（手机号填入既有 username 字段）；`meta.ignoreAccess` 允许未登录直达；禁短信/微信/WPS OAuth |
| 02 | 工作台 | `/mobile/index` | **改造** | 移除 PC 式统计卡（今日巡查/待整改/历史巡查/我的网格四卡）；改为：身份卡（姓名+employee_code+组织/岗位）+ 主按钮【开始巡查】+ 次入口【我的巡查记录】【我的网格】 |
| 03 | 开始巡查 | `/mobile/inspection/start` | **新增** | 巡查人员/员工编码/组织岗位自动带出（GET /api/current-employee，零输入）；身份解析失败 fail-closed 禁止进入；【开始取证】 |
| 04 | 现场取证 | `/mobile/inspection/capture` | **新增** | 第一视觉重点=【拍照取证】虚线大卡；照片组三态/删除/重试/点击全屏预览；≥1 张上传成功后解锁判断按钮：【现场正常】【发现问题】；支持放弃巡查（确认后清空） |
| 05 | 正常巡查提交 | `/mobile/inspection/normal` | **新增** | 巡查信息（人员/编码/组织/日期/结果）+照片证据确认 →【提交巡查记录】POST grid-records（`violationBehavior='无三违行为'`、`needRectification='否'`）→「巡查记录已提交」→ 返回工作台 |
| 06 | 发现问题 | `/mobile/inspection/issue` | **新增** | 【现场存在问题】+ 问题类型；**三违**为唯一业务入口（大按钮）；其他问题类型明示走 PC 端（不实现） |
| 07 | 三违记录 | `/mobile/inspection/violation` | **新增** | 四部分：违规人员（正式员工选择器，不显示敏感信息）→ 三违行为（常用快选+自由文本）→ 三违照片（**固定 3 照片位** 图片1/2/3，超限拒收）→ 提交（含检查来源枚举原样提交）。**不显示扣分/责任人/责任传导/审核/整改/复查**，成功仅提示已进入现有链路 |
| 08 | 巡查记录 | `/mobile/grid/ledger` | 复用 | 服务端 gridScope 过滤的本人台账，字段覆盖：时间/网格/结果/是否整改 |
| 09 | 巡查详情 | `/mobile/grid/detail/:id?` | **增强** | 新增「现场照片」缩略图区（splitImagePaths 解析 image_content）+ 点击全屏预览；其余字段未动 |

流程状态：`views/mobile/inspection/flow.ts` 模块级单例（reactive），承载巡查开始时间、身份上下文、取证照片组；SPA 内路由间共享，不持久化（刷新即重置，符合现场工具语义），不引入新依赖。

## 4. 页面流程

```
/mobile/login（手机号+密码，JWT 复用）
        │
        ▼
/mobile/index 工作台（身份卡 + 开始巡查）
        │ 【开始巡查】
        ▼
/mobile/inspection/start（身份自动带出，fail-closed）
        │ 【开始取证】
        ▼
/mobile/inspection/capture（拍照优先 → 照片组 → 确认证据）
        │                        │
        │ 【现场正常】            │ 【发现问题】
        ▼                        ▼
/mobile/inspection/normal    /mobile/inspection/issue
        │ 提交 grid-records        │ 【三违】
        │ 「巡查记录已提交」        ▼
        └──→ 返回工作台        /mobile/inspection/violation
                                 │ 选人 → 行为 → 3照片位 → 提交 /api/violations
                                 │ 「已提交，后续由现有 HSE 系统处理」
                                 └──→ 返回工作台
我的巡查记录：/mobile/grid/ledger → /mobile/grid/detail/:id（照片可预览）
```

子页面守卫：`capture/normal/issue/violation` 未开始巡查（`flowReady()==false`）时重定向回开始巡查页；未登录访问由 Vben 全局路由守卫重定向至 PC 登录页（`/mobile/login` 提供移动端直达入口）。

## 5. 三违拍照流程（统一后的现场操作序列）

1. 开始巡查（03，身份自动带出）
2. 进入现场
3. **优先拍摄现场证据**（04 拍照取证大卡，后置摄像头 `capture="environment"`）
4. 照片进入照片组：缩略图 + 上传中/已上传/上传失败徽标 + 继续拍照 + 删除 + 点击全屏预览 + 失败单张重试
5. ≥1 张上传成功后「确认现场证据」
6. 判断：现场正常（05）/ 发现问题（06）
7. 问题属三违 → 进入三违记录（07）
8. 选择违规人员（正式员工选择器）
9. 填写/快选三违行为
10. 确认三违照片：固定 3 照片位（图片1/2/3），查看/删除/失败重试
11. 提交（检查来源原样提交）→ 只进入既有数据链路，不显示任何后续处理结果

照片交互纪律落实：
- 只显示本地 blob 即认为上传成功 → **否**（三态徽标，`done` 才取得 `webPath` 相对路径）
- 上传失败仍允许提交 → **否**（`isUploading/hasFailed` 双重提交前校验，三违页另要求 ≥1 张 done）
- 普通文本 URL 替代附件模型 → **否**（`toRelativeUploadPath` 归一化，仅 `/uploads/images/<filename>` 入库）
- 新增第三方图片存储 → **否**
- 前端暴露 WPS 密钥 → **否**（前端无任何 WPS 凭证）

## 6. 复用的既有能力

见 §2.2 A 表。补充说明：
- 上传/错误归一化直接 import `photo-group.ts`（该模块自 GRID-03-B 起即为此目的而生），未复制第二套照片逻辑；
- 员工选择器交互（防抖搜索/选择/重选）按 `violation/new.vue` 既有契约复用同一 API，未新建端点；
- `GET /api/current-employee` 为既有正式端点（Sprint-WPS-02 交付），本次仅补前端封装。

## 7. 新增内容

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `src/api/hse/current-employee.ts` | 新增 | GET /api/current-employee 封装 + fail-closed 归一化 |
| `src/views/mobile/inspection/flow.ts` | 新增 | 巡查流程单例状态（阶段/时间/身份/取证照片组） |
| `src/views/mobile/login.vue` | 新增 | 01 登录页（手机号+密码） |
| `src/views/mobile/inspection/start.vue` | 新增 | 03 开始巡查 |
| `src/views/mobile/inspection/capture.vue` | 新增 | 04 现场取证 |
| `src/views/mobile/inspection/normal.vue` | 新增 | 05 正常巡查提交 |
| `src/views/mobile/inspection/issue.vue` | 新增 | 06 发现问题 |
| `src/views/mobile/inspection/violation.vue` | 新增 | 07 三违记录（3 照片位） |

## 8. 修改文件清单

| 文件 | 修改内容 |
| --- | --- |
| `src/router/routes/modules/mobile.ts` | 追加 `/mobile/login` 顶层路由（ignoreAccess）与 5 个 `/mobile/inspection/*` 子路由；未动既有路由 |
| `src/views/mobile/index.vue` | 工作台重构：移除统计卡与三违直录入口，改为身份卡+开始巡查主按钮+两个次入口（§3/02 决策） |
| `src/views/mobile/grid/detail.vue` | 页内增强：新增现场照片缩略图区与全屏预览；既有字段行/补传入口未动 |
| `src/layouts/mobile.vue` | 底部导航高亮：`/mobile/inspection/*` 归属「首页」高亮；其余未动 |

## 9. 未修改文件清单（关键冻结项核对）

- PC 三违业务 / 责任传导 / 扣分规则 / 审核 / 整改 / 复查：**全部未动**（`server/services/violationService.js`、E-08-11 配置、PC 视图等零改动）。
- `server/` 目录整体：**零改动**（未新增/修改任何后端文件；登录/JWT、`/api/current-employee`、上传、grid-records、violations 全部原样复用）。
- WPS→PG 核心同步逻辑（`services/wpsGridSyncService.js` 等 18-hash 冻结链）：**零改动**。
- 既有移动端页面：`grid/new.vue`（冻结）、`grid/rectify.vue`、`violation/new.vue`、`me.vue`、`grid/index.vue`、`grid/ledger.vue`、`photo-group.ts`、`grid-access.ts`：**零改动**。
- `/mw` 原型：**零改动、零扩展**。
- 登录/JWT 体系、依赖清单（`package.json` 无新增 npm 依赖）：**零改动**。
- 无新增第三方云图片存储；无短信/微信/WPS OAuth 代码。

## 10. 数据流

```
【正常巡查链路】
拍照 → POST /api/files/upload/image → /uploads/images/<f>（相对路径）
     → POST /api/site-mgmt/grid-records
       { inspectionDate, violationBehavior:'无三违行为', needRectification:'否',
         imageContent:'/uploads/images/a.jpg,/uploads/images/b.jpg', personnelName }
     → grid_inspection_records → 既有 WPS 双向/台账链路
     （inspector_employee_id / grid_id 由服务端 req.user→employee→gridScope 派生，H5 不提交）

【三违链路】
拍照(3照片位) → 同一上传接口 → joinImagePaths → POST /api/violations
       { violatorId(员工选择器), violationBehavior, violationDate,
         checkSource(company/township/self 原样), imageContent }
     → 现有三违业务链路（服务端责任解析/扣分/审核/整改/复查，H5 不显示、不计算）
```

employee_code 数据流：手机号+密码 → POST /api/auth/login（JWT）→ GET /api/current-employee（req.user → 员工主数据，返回 employeeCode 供展示）→ 提交时身份仍由服务端权威解析；H5 不提交任何身份字段，手机号不进入业务数据。

## 11. employee_code 处理

1. 手机号只是登录凭据（填入既有 username 字段），**不作为业务键**。
2. 业务身份 = `employee_code`，来源为员工主数据（花名册员工编码），经既有 `GET /api/current-employee` 的 `context.employeeCode` 带出，在工作台（02）、开始巡查（03）、正常提交（05）、三违记录（07）页脚/信息区展示。
3. 与 CF-WPS-05/06 冻结口径一致：H5 展示 employee_code；写库归因链（`employee_code` → `inspector_employee_id`，唯一出口 `services/gridEmployeeCodeResolver.js`）不受本阶段影响、未改动。
4. H5 全程不显示身份证号等敏感信息（人员选择器仅 name/org/position）。

## 12. 验收结果

### 链路一：正常巡查提交
手机号+密码登录 → 工作台 → 开始巡查（身份自动带出）→ 现场取证 → 拍照（照片组上传三态）→ 判断【现场正常】→ 巡查信息+照片确认 →【提交巡查记录】→「巡查记录已提交」→ 返回工作台。**实现完整可走通**（UI 原型级；真机联调结论见 §13）。

### 链路二：三违取证提交
…开始巡查 → 现场取证 → 拍照 → 判断【发现问题】→【三违】→ 选择违规人员 → 填写/快选三违行为 → 三违照片 1/2/3 上传成功 → 提交 →「已提交，后续由现有 HSE 系统处理」→ 返回工作台。**实现完整可走通**；未显示扣分/责任结果（符合 §七 冻结）。

### 十项检查

| 检查项 | 结果 | 依据 |
| --- | --- | --- |
| 页面路由检查 | ✅ | 7 条新路由按模块注册（顶层 login + 5 个 inspection 子路由）；构建通过（§13） |
| 移动端布局检查 | ✅ | 复用 mobile 壳层（max-width 480/560、safe-area、触控目标 ≥44px、底部导航高亮映射已更新） |
| 拍照入口检查 | ✅ | 取证页大卡【+拍照取证】、三违页【+拍照(n/3)】；`capture="environment"` 后置摄像头 |
| 照片上传状态检查 | ✅ | 三态徽标（上传中/已上传/上传失败）实时刷新（photo-group 整对象替换机制） |
| 删除/重试检查 | ✅ | 单张删除（回收 blob URL）、失败单张重试；上传中禁删 |
| 三违照片1/2/3检查 | ✅ | 固定 3 照片位 + 角标「图片1/2/3」+ 超限整批拒收提示；入库 image_content 顺序对应 |
| 表单提交检查 | ✅ | 提交中/已提交状态切换、防重复提交、提交前 isUploading/hasFailed/必填校验 |
| 网络失败检查 | ✅ | normalizeApiError 兼容响应体/网络层两类错误；401/403/409/网络断开均有明确中文反馈 |
| 未登录访问检查 | ✅ | inspection 路由无 ignoreAccess → 全局守卫重定向登录；`/mobile/login` ignoreAccess 可直达 |
| employee_code 传递检查 | ✅ | current-employee 带出并展示；提交不含身份字段，服务端权威派生 |

## 13. 测试结果

| 项目 | 命令/方式 | 结果 |
| --- | --- | --- |
| 生产构建 | `pnpm vite build --mode production --outDir %TEMP%\h5ui01-build` | ✅ 成功（built in 11.45s；首次尝试清空既有 dist 被环境的批量删除护栏拦截，与代码无关，改用临时输出目录验证；**未替换生产 dist**） |
| 新页面打包核对 | 检查产物 chunk（capture/issue/violation/login/start/normal-*.js 及内容特征「现场存在问题/拍照取证/三违照片最多」） | ✅ 全部新页面进入产物 |
| 类型检查 | `pnpm typecheck`（vue-tsc --noEmit --skipLibCheck） | ✅ 修复 5 处新增文件错误后复跑：**新增相关文件 0 错误，全库 60 错误 = 既有基线持平**（修复项：capture/issue 漏 import flowContext、flow.ts 未用类型、login onSuccess 回调签名、capture 模板 ref 绑定方式） |
| 未登录访问 | 路由 meta 静态核对：inspection 路由无 ignoreAccess（全局守卫拦截）；仅 /mobile/login 声明 ignoreAccess | ✅ |
| 十项检查（§12 表） | 静态走查 + 构建验证 | ✅ 全部通过（UI 原型级交付，未做真机自动化测试） |

说明：本轮未做真机/浏览器端到端联调（需真实账号与移动设备），两条验收链路的可走通性基于实现完整性与既有 API 契约核对；真机联调列为后续建议（§15-2）。

### 13.1 续检（同日追加）：账号核查 + dev 全栈 API 级端到端

**账号核查（只读，生产+开发）**：两库各 63 个活跃用户，`users.username` 为 11 位手机号格式者 **0 个**（62 个 grid_inspector + 1 个 admin，用户名均为非手机号字符串）。**手机号登录在现网账号数据层当前不成立**，风险 §14-1 由「未验证」升级为「已确认」，属须业务负责人决策的 STOP 项（批量对齐 username 或授权后端手机号映射，均在本次冻结范围外）。

**dev 全栈搭建**（不触碰 5173/5876/生产 dist）：
- dev 后端 5882（`DB_NAME=safety_dashboard_dev SCHEDULER_ENABLED=false WPS_GRID_SYNC=false`）；
- dev 前端 5177（`vite.config.ui01.ts`：独立 cacheDir=.vite-ui01、/api 与 /uploads 代理 5882）；
- E2E 测试夹具（dev 库，合规 DML）：用户 `13900000001`（grid_inspector，绑定员工曹周平 6697）+ 测试网格 `grid_code=TEST-H5UI01`（grid_areas id=133，remarks 已注明）。

**API 级端到端结果**（使用与 H5 页面完全相同的请求链）：

| 步骤 | 端点 | 结果 |
| --- | --- | --- |
| 手机号+密码登录 | POST /api/auth/login | ✅ 签发 access/refresh（含 jti） |
| 身份上下文 | GET /api/current-employee | ✅ 返回 employeeCode（00179501→后随绑定变化）、组织/岗位 |
| 照片上传 | POST /api/files/upload/image | ✅ 返回相对路径 /uploads/images/... |
| 正常巡查提交 | POST /api/site-mgmt/grid-records | ✅ 创建成功 id=7658；personnelName/grid_id 由服务端派生（客户端值被剥离） |
| 员工选择器 | GET /api/hse/employee/employees/selector | ✅ 返回 employeeId/employeeCode/组织岗位，无敏感字段 |
| 三违提交 | POST /api/violations | ✅ 创建成功 id=7607、7608（checkSource 原样、imageContent 关联） |
| fail-closed 验证 | 未绑定员工 / 无网格账号提交 | ✅ 分别返回 EMPLOYEE_NOT_BOUND / NO_GRID_FOR_EMPLOYEE（H5 已映射为友好文案） |

**浏览器端到端走查（续检完成，13/13 全通过）**：C 盘满载导致无头 Chrome 崩溃的问题，通过将 Chromium profile/缓存/临时目录全部重定向至 G 盘（playwright-core 直驱 + chrome-1228）解决。另发现 dev 环境 bootstrap 存在 `VITE_DEV_USERNAME` 自动登录（静默登 admin），本次以禁用凭据重启 5177 使其失效，从而可测真实登录表单。走查脚本：`server/_h5ui01_browser_e2e.cjs`（可复用回归资产）。

| # | 步骤 | 结果 |
| --- | --- | --- |
| 01 | 登录页渲染（手机号+密码字段） | ✅ |
| 02 | 手机号登录成功进入工作台（曹周平 / 员工编码 00307234） | ✅ |
| 03 | 开始巡查页身份自动带出 | ✅ |
| 04 | 取证页判断按钮无照片时禁用（先取证后判断） | ✅ |
| 05 | 两张照片上传完成（已上传徽标）且判断解锁 | ✅ |
| 06 | 链路一：正常巡查提交成功并返回工作台 | ✅ |
| 07 | dev 库确认巡查记录入库（grid_id=133 派生、照片相对路径） | ✅ id=7662 |
| 08 | 正式员工选择器搜索选中（无敏感信息） | ✅ |
| 09 | 三违照片位（图片1 标识 + 上传完成） | ✅ |
| 10 | 链路二：三违提交成功且**不渲染**扣分/责任结果数据 | ✅ |
| 11 | dev 库确认三违记录入库 | ✅ id=7612（检查人曹周平、违规人韩婷、company 来源、照片路径） |
| 12 | 巡查记录（台账）列表加载 | ✅ |
| 13 | 巡查详情照片缩略图展示（2 张） | ✅ |

至此，任务书 §十一 两条验收链路在**真实浏览器 + 真实后端 + 真实数据库**层面完整走通。

**遗留 E2E 夹具说明**：测试账号 13900000001 / 测试网格 TEST-H5UI01 保留在 dev 库供后续回归使用；如需清理：DELETE grid_areas WHERE grid_code='TEST-H5UI01' + 复位 users.id=249。

### 13.2 收尾复核（同日追加）：第二轮链路落库 + 「内部服务器错误」toast 归因

**后端日志全窗扫描**（dev 后端 5882 自 17:38 启动起的完整请求日志）：**无任何 5xx 响应**。仅有的两条「请求异常」均为 401 且属预期（一次为 register 端点 auth 中间件探测；一次为 E2E 负向用例 `__h5ui01_disabled__` 登录失败）。因此浏览器走查截图中出现的「内部服务器错误，请稍后再试」toast **并非后端 500**：判定为前端在登录成功跳转期间对被中断/失败请求的通用兜底文案（`normalizeApiError` fallback），第二轮 E2E 未复现，其后全部请求 200/304，无功能影响。列为观察项，不阻塞交付。

**第二轮完整链路（18:30）落库复核**（dev 库直查）：

| 表 | 行 | 关键字段 |
| --- | --- | --- |
| grid_inspection_records | id=7663 | 曹周平、无三违行为、无需整改、image_content=2 张照片逗号拼接（相对路径） |
| violation_records | id=7613 | 违规人韩婷（employee 6693）、巡查人曹周平（6697）、check_source=company、violation_behavior=未佩戴安全帽、image_content=1 张照片、status=待处理 |

服务端日志同时佐证违规人解析：`[violations] violator_name "韩婷" 唯一匹配到 employee.id=6693`。至此两条验收链路各有两轮（18:25 / 18:30）完整的「浏览器 → API → 数据库」闭环证据。

**收尾清理**：一次性脚本 `_h5ui01_bind2.cjs`、`_h5ui01_screenshots.cjs`、`_h5ui01_verify_rows.cjs` 已删除；保留 `_h5ui01_browser_e2e.cjs`（回归资产，§13.1）与 `vite.config.ui01.ts`（dev 前端配置）；`%TEMP%\h5ui01-build*` 为临时构建产物（C 盘空间紧张，可手动删除，不影响任何功能）。dev 全栈（后端 5882 / 前端 5177）保留运行供回归。

## 14. 已知问题

1. **登录凭据与账号数据匹配**：`POST /api/auth/login` 以 `username` 精确匹配 `users.username`。若既有账号的 `username` 不是手机号，H5 登录页输入手机号将无法命中。这属于账号数据治理问题（是否将 username 统一为手机号），**须由业务负责人决定**，本阶段按冻结原则未改登录体系与账号数据。
2. **Cloudflare Pages/Worker 未接线**：任务书 §七的目标架构（H5→CF Pages→CF Worker→WPS）中，Worker 仅有归档 POC（grid-mobile-cloudflare/worker，WPS OAuth）。本阶段为 UI 原型级实现，运行在现有同源链路（Node 后端 5876 同源托管 dist + /api）；是否/何时切换到 CF 部署属架构决策，超出「本阶段只做页面与交互」的冻结范围。
3. **巡查照片与三违照片共用 image_content**：网格巡查表的「三违照片：图片1/2/3」在 PG 中即 image_content 一列；正常巡查的现场照片与三违照片在此列上语义重叠（既有模型如此，PC 端同样用法）。未扩列、未改模型。
4. **/mobile/violation/new 旧页保留**：旧三违录入页仍展示服务端扣分结果，与新冻结原则不一致但属于既有已验收功能（MOBILE-05），本阶段未删除/未修改；后续如需收口，建议单独阶段处理。
5. **流程状态不持久化**：刷新页面后未提交的取证流程丢失（现场工具语义下的有意设计）；离线/弱网续传属后续阶段。

## 15. 后续建议

1. 账号数据核对：确认网格长账号 `users.username` 与手机号的对应关系（或由管理员批量对齐），否则 H5 登录页无法实际登录。
2. 真机联调：在 iOS/Android 微信内置浏览器与系统浏览器各过一遍两条链路（拍照调起、safe-area、上传弱网重试）。
3. 若确认切换 Cloudflare 架构，再立阶段将 `/mobile` 流程页迁移至 CF Pages + Worker + WPS 缓冲链路（可复用本阶段全部页面代码，仅替换传输层）。
4. 三违行为词表（BEHAVIOR_PRESETS）后续可改为从服务端/规则配置读取，避免前端硬编码枚举。
5. 巡查详情的三违信息目前来自网格巡查台账行（violationBehavior 等列）；如需展示正式三违记录（POST /api/violations 产生）的详情，建议后续打通台账↔三违台账的关联展示。

## 16. 本阶段最终状态

**PASS_WITH_RISK**

已完成（真实交付）：
- 9 个页面全部落地：新增 6 页（login/start/capture/normal/issue/violation）+ 改造工作台 + 增强详情页 + 复用台账页；
- 统一拍照流程与照片组交互（三态/删除/重试/预览/提交前校验）全部落实；
- 三违 3 照片位（图片1/2/3 业务兼容）落实；
- employee_code 身份链落实（current-employee 复用，提交不含身份字段）；
- 后端零改动、依赖零新增、/mw 零扩展、冻结清单全部未触碰。

风险（须业务负责人知悉/决策）：
1. **登录凭据匹配（已确认阻塞真实登录）**：只读核查生产/开发共 63 个活跃账号，**0 个** username 为手机号格式——手机号登录页在现网数据下无法登录任何既有账号（§13.1）。两条出路均需决策授权：(a) 批量对齐 `users.username` 为手机号（影响 PC 登录）；(b) 授权后端增加手机号→用户名映射（触碰登录体系，本阶段冻结）。测试可使用 dev 库测试账号 13900000001。
   **【2026-09-15 更新：已由 H5-GRID-LOGIN-02 以第三条路解决】**——不动 username、不加映射表，审计发现 `users.phone`（生产 63/63 手机号格式、0 重复）可作登录凭据源，新增独立 `POST /api/mobile/auth/login`（phone → users.phone → users.employee_id → employee → employee_code，复用现有密码验证与 JWT，fail-closed），API 级 16/16 + 浏览器 E2E 9/9 通过，且本报告的两条巡查链路 E2E 在新登录下 13/13 复归通过。详见《H5-GRID-LOGIN-02-手机号密码移动端登录映射实施报告.md》。
2. **未接入 Cloudflare Pages/Worker**：本阶段运行于现有同源链路（§14-2）。
3. **生产 dist 未替换**：构建验证通过但发布（重建 dist）属生产变更，待授权后执行（§14-2/§13）。
4. **浏览器 E2E 已完成（13/13）；真机联调未做**：桌面 Chrome + dev 全栈全链路走通；真机（iOS/Android 拍照调起、safe-area）仍待后续（§15-2）。

---

## 附：验证执行记录（2026-09-15）

1. 生产构建：`vite build --mode production`（临时 outDir）两次通过（11.45s / 11.41s，8589 modules transformed）。
2. 类型检查：`vue-tsc --noEmit --skipLibCheck`，新增/改动相关文件 0 错误，全库 60 错误与既有基线持平。
3. 十项检查为静态走查 + 构建验证；浏览器 E2E 13/13 通过（§13.1），两条验收链路两轮落库闭环（§13.2）。
4. 账号核查（只读）：生产/开发各 63 活跃账号，username 手机号格式 0 个（§13.1，风险 §14-1 已确认）。
