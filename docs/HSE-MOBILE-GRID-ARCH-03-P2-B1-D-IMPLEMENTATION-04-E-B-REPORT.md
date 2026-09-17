# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 04-E-B

# Revoke UI 最小实施报告

| 项  | 值                                                                                                    |
| -- | ---------------------------------------------------------------------------------------------------- |
| 阶段 | `PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-E-B`                                        |
| 状态 | **`..._04-E-B_IMPLEMENTED`**                                                                         |
| 日期 | 2026-09-13                                                                                           |
| 前置 | 04-E-A `READY_FOR_REVIEW`；DECISION-01=A（reason 不进 UI）、DECISION-02=A（dialog.warning 信息型确认）——均已按用户确认执行 |
| 谱系 | 04-D-A ✅ 04-D-B ✅ **04-E-B ✅**                                                                       |

---

## §一 修改文件清单（严格两文件，零越界）

| # | 文件                                                    | 修改点                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| - | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `src/api/hse/grid-attribution.ts`（139→160 行）          | ① 新增 `revokeRecord({record_id})`：`requestClient.delete('/grid-attribution/revoke', { data: { record_id } })`，**请求体仅 `{record_id}`**；② 文件头路由清单注释同步（「本阶段前端不调用」→「04-E-B 起在已归属页消费」）；③ JSDoc 写明禁提交字段清单与错误码（NOT_REVOCABLE / RECORD_NOT_FOUND / REVOKE_CONFLICT）、并发不重试约定                                                                                                                                                                                                                                                                                     |
| 2 | `src/views/site/grid/attributed/index.vue`（235→310 行） | ① 导入 `dialog, message`（`#/adapter/naive`，与 grid-ledger 同款）与 `revokeRecord`；② 新增操作列（`fixed:'right'`、width 100、slot `#action`）：仅 `manual_confirmed` 行渲染 `NButton size=small type=warning secondary`「撤销归属」，**`attributed` 行渲染 `-`**；③ `onRevoke(row)`：状态守卫（非 manual_confirmed 直接 return）→ `dialog.warning`（标题「撤销归属确认」、五要素内容、`确认撤销`/`取消`、**无 reason 输入框**）→ 确认后调 API → 成功 `message.success('撤销归属成功')`；④ 错误映射表 `REVOKE_ERROR_HINTS`（三个业务码 → 规格 §七指定文案，其他错误用 `err.message` 通用提示）；⑤ `finally` 中一律 `loadData()` 重查（成功=行消失、失败=状态可能已被并发改变）；**不本地修改任何行字段、不自行重试** |

**未修改**：server 端零改动（`git status server/` 与开工前完全一致，仅历史 3 个已授权文件）；路由/authority/locale/菜单/组件/依赖均未动；`adapter/naive.ts` 未动（见 §三 DEF-B）。

## §二 验收结果（对照规格 §十六 15 项）

| #  | 验收项                    | 结果                                                                                                                                            |
| -- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | 修改文件清单                 | ✅ 恰好 2 文件（§一）                                                                                                                                 |
| 2  | 每文件修改点                 | ✅ §一                                                                                                                                          |
| 3  | typecheck              | ✅ **60 = 基线**（vue-tsc 全量，两文件 0 错误）                                                                                                            |
| 4  | manual_confirmed UI    | ✅ Case1a/1b/1c：全页按钮恰好 1 个、与 manual_confirmed 主行**镜像行索引对齐**、可见                                                                                 |
| 5  | attributed 无按钮         | ✅ Case2/10：该行 0 按钮、镜像行显示 `-`、全页按钮总数=1                                                                                                         |
| 6  | dialog 二次确认            | ✅ Case3（7 断言）：标题/记录ID/编号/巡查人/网格/后果声明/无 reason 输入框                                                                                             |
| 7  | DELETE revoke E2E      | ✅ Case5：恰好 1 次请求，请求体**逐字节 = `{"record_id":7470}`**，无任何额外键                                                                                     |
| 8  | DB 状态变化                | ✅ Case6：`attribution_status='pending'`、`inspector_employee_id IS NULL`、`grid_id IS NULL`                                                      |
| 9  | audit_record           | ✅ Case7（5 断言）：`action='revoke'`、**old_value=真实旧值**（manual_confirmed/7643/67）、new_value={pending,null,null}、changed_fields 三字段、操作人=admin 会话+IP |
| 10 | pending 回流             | ✅ Case9：04-C 页「待处理数量：1」，该记录出现在待归属队列                                                                                                           |
| 11 | grid_inspector 权限      | ✅ Case11：页面不可达（前端路由过滤）+ **真实 DELETE 请求 403** + 数据未被改动                                                                                         |
| 12 | 测试数据清理                 | ✅ gir 按标记删除（7470/7471）、audit 按模块删除（id=25），**零残留**                                                                                             |
| 13 | dev 基线恢复               | ✅ 五项逐项实测：gir=**2061** / max_id=**7192** / pending=**0** / grid-attribution 审计=**0** / sync_map=**2061**                                       |
| 14 | 生产零写入                  | ✅ 见 §四（连接路径证明 + 计数器 A/B 甄别）                                                                                                                   |
| 15 | WPS/Scheduler/Pull 未触碰 | ✅ 零代码、零连接、零进程操作（`git status` 证明）                                                                                                              |

**E2E 汇总**：35/35 断言全过（`p2b1d04eb_e2e.cjs`，默认代理链路 5173→5881→dev 库，零拦截）；Case4 取消路径不发请求、DB 不变；浏览器控制台零错误。

## §三 ⚠️ 实施过程中发现的既有跨域缺陷（DEF-B，非本阶段引入）

**现象**：默认（auto 主题模式）+ 浅色系统下，`dialog.warning` 弹窗**文字白色渲染在白色面板上，视觉不可见**（DOM 内容完整，E2E 文本断言全过；仅视觉失效）。

**根因（既有代码，两处判断互为镜像）**：

- `app.vue:34`（页面级 NConfigProvider）：`mode === 'dark' ? darkTheme : lightTheme` ⇒ auto ⇒ **亮色页面**
- `adapter/naive.ts`（discrete API，dialog/message/notification 共用）：`mode === 'light' ? lightTheme : darkTheme` ⇒ auto ⇒ **darkTheme 弹层文字（白）**+ HSE 亮色覆盖面板（白底）⇒ 白字白底

**证据**：

- auto+浅色系统：dialog bg `rgb(255,255,255)`、title `rgba(255,255,255,0.9)`、content `rgba(255,255,255,0.82)`（截图 2-dialog.png 白面板空内容）；
- auto+暗色系统（colorScheme:'dark'）：页面 `html.dark`、dialog bg `rgb(36,36,36)` + 白字 = **完全可见且一致**（截图 6-dialog-light-pref.png，五要素清晰可读）⇒ 弹窗组件本身正确，问题仅在主题倒置。

**影响面（既有）**：所有使用 discrete API 的既有页面——`grid-ledger`（清空台账确认）、`warning-center`、`employee`、`reports`、`safety-culture`、`assessment-monthly`、`employee-import-v2`、`violation` 等 8+ 页面的确认弹窗在默认 auto+浅色模式下同样受影响。

**修复（1 行，待授权，超出本阶段两文件范围）**：`adapter/naive.ts` 的条件与 `app.vue:34` 对齐：`preferences.theme.mode === 'dark' ? darkTheme : lightTheme`。

### §三.1 DEF-B 已修复（09-13，用户单独授权「修 DEF-B」）

**实施**（授权后实际改动，均在 `adapter/naive.ts` 同一文件内）：

- 第一版 1 行条件对齐（`mode==='dark'?dark:light`）经验证**不充分**：auto 模式下 `preferences.theme.mode` 保持 `'auto'`，静态三元无法同时满足两种系统色系——修后 auto+浅色 ✅ 但 auto+暗色 反转为深底深字（对比度 2）。
- **终版**：改用框架自带的 `usePreferences().isDark`（`isDarkTheme`：显式 dark/light 直判，auto 经 `matchMedia('(prefers-color-scheme: dark)')` 解析，与页面 `html.dark` 同语义）：

```ts
const { isDark } = usePreferences();
theme: isDark.value ? darkTheme : lightTheme,
```

**双模式验证全过**（`p2b1d04eb_defb_verify.cjs`，含亮度差对比断言）：

| 模式        | 弹窗背景               | 标题色                     | 对比度       |
| --------- | ------------------ | ----------------------- | --------- |
| auto+浅色系统 | `rgb(255,255,255)` | `rgb(31,34,37)`         | **221** ✅ |
| auto+暗色系统 | `rgb(36,36,36)`    | `rgba(255,255,255,0.9)` | **219** ✅ |

**回归**：04-E-B E2E 全量重跑 **ALL PASS**（35 断言，撤销闭环不受影响）；typecheck **60=基线**（adapter 0 错误）；截图 `shots-04eb-e2e/defb-light.png` / `defb-dark.png`。

**影响面**：修复惠及全部 discrete 弹层使用方（dialog/message/notification/modal/loadingBar）——grid-ledger、warning-center、employee、reports、safety-culture、assessment-monthly、employee-import-v2、violation 及 04-E-B 撤销确认。

**遗留观察（未处理）**：`app.vue:34` 的页面级判断 `mode==='dark'` 同样不解析 auto（页面 naive 基础组件在 auto+暗色下理论上选了 lightTheme 基底，但被 CSS 变量类 HSE 覆盖修正，实际渲染正常）；如需统一可后续单独授权，非阻断。

**本阶段处置**：不修（越界）；已用 auto+dark 一致性路径完成弹窗视觉验收；登记 DEF-B 待用户决定。

**框架层附带观察**（未深挖，仅记录）：偏好缓存合并注释称「初始化配置优先，缓存仅补齐缺失字段」，实测注入的缓存 theme.mode 无法覆盖 overrides 的 `auto`（E2E 环境验证）；真实用户主题切换的持久化路径未验证，如需修复 DEF-B 时应一并确认。

## §四 生产零写入证明（两层）

1. **连接路径证明**：本轮所有 DB 访问均为 `database: 'safety_dashboard_dev'` 的显式连接（脚本可核）；API 调用全部经 `5173 → 5881`，5881 已于 04-D-B 用计数器差值法实测绑定 dev 库；无任何代码路径指向 `safety_dashboard`；生产 5876/PID 23396 全程 LISTENING 未动。
2. **计数器 A/B 甄别**：`pg_stat_database`（经 dev 连接读集群统计，不连生产库）显示生产计数器 delta 随窗口波动——本轮 E2E 两短窗口 delta=0；更早一次含 30s 超时挂起的约 3 分钟窗口 delta=34881，对应生产**自身**后台活动（5876 后端 + 15 分钟 Pull Scheduler 属 05-H-0 冻结常态）。波动与本项目测试动作无关联性（无生产连接路径），判定为生产自身活动。

## §五 E2E 断言写法教训（已入 skill）

- vxe **fixed:'right' 列的按钮渲染在右侧固定列镜像表中**，主行不含该 cell ⇒ 行内找按钮必然失败；正确做法：全页按钮计数 + 「按钮所在 tr 在其表体的序号 == 目标主行在其表体的序号」对齐断言；
- ID 列 fixed:'left' 同理在镜像中 ⇒ 主行文本不含 id，行定位须用非固定列文本（如 serial_no）；
- PG 同一 `$1` 同时作 varchar 字面量与 `||` 拼接 ⇒ 「推断出不一致的类型」，须显式 `$1::varchar`（再次踩到，第 2 次）。

## §六 状态与后续

- **04-E-B 完成**：`manual_confirmed → pending` 撤销闭环 UI 就绪（dev 全链路验证）；04-D-A ✅ 04-D-B ✅ 04-E-B ✅。
- c
  1. **DEF-B 修复授权**（1 行，`adapter/naive.ts` 主题条件对齐——影响全部既有 discrete dialog 的默认模式可见性）；
  2. 生产重启 23396（R2 + 04-B/04-D-B/04-E-B 生产生效的唯一途径）；
  3. stamping 生产 apply（让真实 pending/已归属数据产生）；
  4. G2（/pending 真分页）、H1（audit-records 权限，用户已明确暂缓）。
- 本阶段到此停止，未自动进入任何新阶段。
