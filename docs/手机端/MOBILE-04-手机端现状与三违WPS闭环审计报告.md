# MOBILE-04：手机端现状与三违/WPS 闭环审计报告

> **任务性质**：只读审计，零代码修改、零数据写入、零重启。
> **执行时间**：2026-09-14 22:31–23:00
> **审计方法**：报告 ↔ 代码 ↔ API ↔ 构建产物 ↔ 生产库只读计数，五方交叉验证。
> **生产写入口径**：`PRODUCTION_WRITE=0` `DATABASE_MODIFIED=0` `WPS_MODIFIED=0` `CODE_MODIFIED=0`（仅两条只读 SELECT 计数与 GET 探测）。

---

## 1. 正式手机端定位（§四）

| 项 | 结论 |
| --- | --- |
| 正式手机端 | **`安全看板vben/apps/web-naive` 内嵌 `/mobile` 模块**（非独立 H5 工程） |
| 壳层路由 | `src/router/routes/modules/mobile.ts`（`/mobile/*`，`meta.noBasicLayout` 脱离 PC 布局） |
| 自定义布局 | `src/layouts/mobile.vue`（顶部 + 底部导航，安全区适配） |
| 页面目录 | `src/views/mobile/`：`index.vue`、`me.vue`、`grid/{index,ledger,new,rectify,detail}.vue`、`grid/{grid-access,photo-group}.ts`、`mobile.css`，共 3354 行 |
| API 层 | 完全复用 `#/api/hse/site.ts` + `#/api/hse/grid-upload.ts`，**零新增 `/api/mobile/*`** |
| 构建配置 | 复用 web-naive `vite.config.ts`（`allowedHosts:true` 局域网放行、dev `/api`→5882、`/uploads`→5876） |
| 技术栈 | Vue 3 + TS + Vben v5（响应式 WebApp，**非 PWA/uni-app**；`docs/网格长巡查台账_手机端PWA设计/` 仅为设计文档，未落地独立应用） |
| 源码状态 | git 干净（已提交） |
| 历史候选目录排查 | 全项目无第二个手机端工程；`apps/web-antd` 等为 PC 模板壳，非手机端 |

**不存在多个手机端目录并存问题。** 唯一正式手机端 = web-naive `/mobile` 模块。

## 2. Mobile 01/02/03 落地交叉验证（§五）

项目内 Mobile 阶段命名与代码注释谱系对应（未发现以 `MOBILE-01/02/03` 命名的独立归档报告，验证以**代码注释 + ARCH 系列报告 + 构建产物**为准）：

| 阶段 | 代码注释证据 | 交叉验证 | 结论 |
| --- | --- | --- | --- |
| 01-A/01-B 壳层 | `mobile.ts`「HSE-MOBILE-GRID-01-B 壳层路由」、`me.vue`/`mobile.css` 01-B 标记 | 路由已注册、布局可用、dist 含 chunk | ✅ 落地 |
| 01-C 真实数据 | `index/grid/ledger/detail.vue` 均「01-C 真实数据」 | 复用 `GET /site-mgmt/grid-records`（服务端 gridScope 行级过滤），生产 401 鉴权正常 | ✅ 落地 |
| 02-A/02-B 录入+图片 | `new.vue`「02-B 手机→现有正式 API→PostgreSQL」 | `POST /site-mgmt/grid-records` + `POST /files/upload/image` 全链路存在；生产 `WPS_GRID_DATA_SOURCE=false` 走 PG 主链 | ✅ 落地 |
| 03-A 网格访问控制 | `grid-access.ts`（仅显示门槛） | 授权 100% 服务端：`requirePermission('hse:site:grid:update')` + `resolveGridScope/buildScopeSqlCondition`（越权 403+SCOPE_DENIED） | ✅ 落地 |
| 03-B 补传整改照片 | `rectify.vue`/`photo-group.ts` 03-B 标记 | `PUT /site-mgmt/grid-records/:id`，只提交 `rectified_photo/rectifier` 两字段 | ✅ 落地 |
| ARCH-03 WPS 缓冲 | `docs/HSE-MOBILE-GRID-ARCH-03-*` 27 份 | P2-B1-D-05-C 生产回填完成：归属分布 NULL=1734 / 已归属+待确认≈337（现库 `inspector_employee_id` 非空=337） | ✅ 归属闭环已生产 |

## 3. 手机端三违现场闭环审计（§六核心）

**逐节点结论表：**

| 环节 | 是否存在 | 当前实现 | API | 数据来源 | 可用 | 风险 |
| --- | --- | --- | --- | --- | --- | --- |
| 手机打开/登录 | ✅ | 复用 PC 登录页 + accessStore（无独立手机登录） | `/auth/*` | users | ✅ | 无 |
| 识别登录人员 | ✅ | `useUserStore` 只读展示，不可编辑 | — | 服务端 JWT | ✅ | 无 |
| 确定网格范围 | ✅ | 服务端 `deriveGridIdForEmployee`：0 网格→403 / 多网格→409 fail-closed | `POST grid-records` | grid_areas.personnel_id | ✅ | 无 |
| 选择被检查人员 | ⚠️ | 仅自由文本 `violatorName`（选填），不绑 employeeId | — | 手工输入 | 部分 | 姓名≠PG employee，无法精准定位责任人 |
| 三违行为 | ⚠️ | 自由文本 `violationBehavior`（必填） | `POST grid-records` | grid_inspection_records | 部分 | 是网格台账语义，**非正式三违记录** |
| 检查来源 | ❌ | 手机端无检查来源字段（grid 记录无此概念） | — | — | 不适用 | 无「未明确→默认扣分」风险（手机不写 violation_records） |
| 现场拍照 | ✅ | `<input capture="environment">` 多拍+单张重试 | `POST /files/upload/image` | /uploads/images | ✅ | 无 |
| 提交 | ✅ | 白名单字段（camelCase），空值不上送 | `POST /site-mgmt/grid-records` | PG | ✅ | 服务端无幂等键（客户端有防重守卫） |
| 责任解析/扣分 | ❌ | **不触发**——grid 记录不进三违规则引擎 | — | — | ❌ | E-08-11 链路手机端完全不涉及 |
| PC 端查询 | ✅ | 同一 PG 表，PC 网格台账可见 | `GET grid-records` | PG | ✅ | 无 |

### ⭐ 核心结论

> **手机端当前是「网格巡查」闭环，不是「三违」闭环。**
> 手机端全部 7 个页面均属 grid_inspection_records 域；正式三违（violation_records、检查来源、E-08-11 分层责任扣分）**只在 PC 端** `/site/violation/records`。手机端不存在三违录入页、无检查来源表达、无责任扣分回显——**业务规格中的"手机录入三违→责任解析→扣分→回显"链路整体缺失**，属真缺口而非展示缺口。

### 身份链专项（§六 B/C/D）

- **检查人**：服务端三重防伪造——`delete inspectorEmployeeId/inspector_employee_id`、`delete gridId/grid_id`、`delete personnelName/personnel_name` 一律剥离，唯一身份源 = `resolveAuthenticatedEmployee(user.id)`，fail-closed（解析失败拒绝创建，禁 NULL INSERT、禁姓名兜底）。✅ **符合规格最高要求**。
- **被检查人**：客户端可传姓名/性别/年龄自由文本，但均为非身份描述字段，服务端不据此绑定人员——无伪造关键身份风险；代价是无法精准扣分（语义为台账）。
- **检查来源**：不适用（见上），手机端不可能把"未明确"转换为默认扣分。

## 4. WPS 链路审计（§七/§十四）

| 检查项 | 结论 |
| --- | --- |
| 手机端直连 WPS | **0 处**（grep 全 mobile 源码仅 1 条注释提及"保留既有 WPS 绝对 URL"） |
| 手机端写 WPS / 绕过后端 / 直连 PG | 均无——全部经 HSE 后端 API |
| 依赖 WPS Creator 判定检查人 | 无——检查人 100% 服务端按登录身份派生 |
| 手机端改 WPS 历史 | 无 |
| 架构符合性 | **手机 → HSE 后端 → PostgreSQL** ✅；WPS 按 `WPS→Pull/Sync→PG` 单向运行（05-H-0 冻结）✅ |
| 生产配置 | `WPS_GRID_DATA_SOURCE=false`（PG 主数据源）、`WPS_GRID_SYNC=true`（Pull 活跃） |
| PG→WPS 反向推送 | 已封禁（WPS-PG-SYNC-01），gridRecordCreate 明确"不再触发 WPS 推送" |
| sync_map | `grid_record_sync_map=2061` 与 `grid_inspection_records=2061` 一一镜像 |
| 数据现状 | 归属回填后 `inspector_employee_id` 非空 337 行；2026-09-12 后新增手机提交=0 行（尚无真实现场使用量） |

**MOBILE_WPS_CHAIN_READY=YES**（架构原则完全符合，无历史违规实现需标记）。

## 5. 手机访问方式审计（§九）

| 项 | 生产（推荐试用通道） | 开发 |
| --- | --- | --- |
| 地址 | `http://<PC局域网IP>:5876/mobile/index`（SPA 回退 200 已实测） | `http://<PC局域网IP>:5888/mobile/index` |
| 端口/绑定 | 5876，`server.listen(PORT)` 默认绑 0.0.0.0 → 局域网手机可达 | VITE_PORT=5888，`allowedHosts:true` 已放行局域网 |
| API baseURL | `/api` 相对路径（同源，无 localhost 硬编码问题） | `/api` → proxy 5882（DEV 库）；`/uploads` → 5876 |
| HTTPS/域名 | **无**（纯 HTTP，明文传输凭据属已知边界） | 无 |
| 限制 | 同机托管：**PC 关机则手机端不可用**（ARCH-02 已定论，Backend 出本机为前置） | — |

## 6. 手机端现状矩阵（§十一）

| 模块 | 状态 | 证据 | 可用 | 缺口 | 需开发 |
| --- | --- | --- | --- | --- | --- |
| 手机端入口 | ✅ | `/mobile` 路由 + dist chunk + 5876 回退 200 | ✅ | 无 | 否 |
| 登录 | ✅ | 复用 PC auth；登出复用 authStore.logout | ✅ | 无 | 否 |
| 登录身份 | ✅ | 服务端 resolver fail-closed，客户端字段全剥离 | ✅ | 无 | 否 |
| 网格范围 | ✅ | deriveGridId 0/1/N→403/使用/409 | ✅ | 无 | 否 |
| 检查人员（检查人） | ✅ | 只读展示=登录身份 | ✅ | 无 | 否 |
| 被检查人员 | ⚠️ | 自由文本，无 employeeId 绑定 | 部分 | 精准人员绑定 | 是（三违阶段） |
| 三违录入 | ❌ | 手机无 violation 页面 | ❌ | 整页缺失 | **是（新 Sprint）** |
| 检查来源 | ❌ | 手机 grid 表单无此字段 | 不适用 | 随三违页补 | 是（三违阶段） |
| 头盔三违 | ❌ | 无（属三违规则域） | ❌ | 同上 | 是 |
| 图片上传 | ✅ | 魔术字节+类型白名单+相对路径入库+三态重试 | ✅ | 无 | 否 |
| 三违提交 | ⚠️ | grid 提交可用；violation 提交缺失 | 部分 | POST /violations 手机接入 | 是 |
| 后端责任解析 | ✅(PC) | E-08-11 已生产；手机未接入 | PC✅/手机❌ | 手机触发面 | 是 |
| 扣分 | ✅(PC) | deductionStatusInfo PC 已展示；手机无 | PC✅/手机❌ | 手机回显 | 是 |
| PC端查询 | ✅ | 同 PG 表，PC 台账/三违页可查 | ✅ | 无 | 否 |
| WPS数据来源 | ✅ | PG 主数据源，sync_map 2061 镜像 | ✅ | 无 | 否 |
| WPS同步 | ✅ | Pull 引擎活跃、反向写封禁 | ✅ | 无 | 否 |
| 手机访问 | ⚠️ | HTTP+局域网 IP 可用；无 HTTPS/域名/离线 | 部分 | HTTPS、Backend 出本机 | 视部署决策 |

## 7. 六状态判定（§八/§十五）

```text
MOBILE_SOURCE_READY=YES      （网格域源码完整、已提交、类型检查基线内）
MOBILE_BUILD_READY=YES       （dist 含 grid/grid-ledger 等 mobile chunk，5876 托管）
MOBILE_ROUTE_READY=YES       （/mobile/* 全路由，SPA 回退实测 200）
MOBILE_API_READY=YES         （网格域 API 全链通；无 token 401 鉴权正常）
MOBILE_BUSINESS_READY=PARTIAL（网格巡查可现场用；三违闭环整体缺失）
MOBILE_WPS_CHAIN_READY=YES   （零直连、单向架构、身份服务端派生）

MOBILE_04_STATUS=PASS
```

## 8. 三分类结果（§十二）

**结果一：已完成，可直接继续使用**
登录复用与登出、移动布局壳层、我的网格/巡查台账/详情（真实数据+行级权限）、新增巡查（拍照多图+三态上传+服务端身份派生+fail-closed 网格判定）、补传整改照片、图片上传链、PG 主数据源与 WPS 单向同步、归属回填（337/2061 已归）。

**结果二：已有代码但受限**
- 整体可用性受「PC 关机即全停」约束（Backend 在本机，ARCH-02 结论）；
- 被检查人员仅自由文本——能提交但不能支撑后续精准扣分；
- 服务端无幂等防重（客户端守卫已覆盖常规双击，弱网重放无兜底）。

**结果三：真正缺失（需后续开发）**
1. **手机端三违录入页**（检查来源三态表达、被检查人员 employee 选择器、E-08-11 规则接入、责任对象与分层分值回显、evidence-chain 展示）——最大缺口；
2. 手机端 `POST /api/violations` 接入 + `deductionStatusInfo` 回显；
3. HTTPS/域名/独立部署位（或内网acceptable，需业务拍板）；
4. 服务端提交幂等键；
5. 离线缓冲（ARCH-02/03 规划的 WPS 缓冲离线提交，现架构下未实现）。

## 9. 风险登记（§十三 范围外，仅记录不处理）

- `routes/ai-v2.js` auth 路径断链（下次生产重启 crash 风险）——**非本任务范围**；
- AI Provider/页面缺口——**非本任务范围**；
- 归属未覆盖 1734 行 NULL（历史 WPS 期记录无巡查人员 ID，属 ARCH-03 既定终态）；
- 纯 HTTP 明文传输（局域网内使用，正式外用需加密通道）。

## 10. 下一阶段建议（§十三）

**建议定级：B 类 + C 类并存**
- **B 类（少量修复后现场试用）**：网格巡查域已具备真实现场试用条件——建议以「网格长现场巡查台账」场景先试运行，积累真实使用数据（当前 09-12 后新增=0）。前置：修 ai-v2.js 断链（重启前必须）、确认试用账号的 employee 绑定与网格归属。
- **C 类（完整 Sprint）**：手机端三违录入闭环（页面+API 接入+E-08-11 回显+人员选择器），是"手机用三违"目标的必要条件。

本阶段仅审计，未开始任何 A/B/C 开发。

---

*审计证据：生产只读计数（grid_records=2061 / with_inspector=337 / sync_map=2061 / recent>0912=0）、GET 探测（/mobile/index 200、grid-records 无 token 401、health 200）、代码全量走查（mobile 域 3354 行 + siteMgmtService.gridRecordCreate + vite.config.ts + .env 键名）。*
