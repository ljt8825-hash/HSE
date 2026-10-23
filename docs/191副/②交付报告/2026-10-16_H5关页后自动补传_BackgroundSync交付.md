# H5 关页后自动补传（Background Sync 方案一+通知兜底）交付报告（CF-WPS-105）

> 日期：2026-10-16　类别：②交付报告　归属对话：H5 关页后自动补传（用户输入法谐音「观叶猴」=「关页后」）
> 改动文件：`grid-mobile-cloudflare/frontend/check.html`（镜像层 + 5 钩子）、`sw.js`（+180 行重放块）；版本 **2026-10-16.105**（仅 check.html 三处 bump；app.js 未改，其余页面停留 .104）；零 Worker、零生产数据、零 WPS

## 一、需求与方案选定

用户问「是否可以增加关页后自动补传的功能？」——即 CF-WPS-103 交付时记录的可选增强：Chrome 安卓 Background Sync。给出两案后用户选定**方案一（SW 内完整重放，真正无感自动补传）含方案二兜底（系统通知）**。

场景闭环：乡镇弱网提交失败 → 用户关页走人 → 晚上回家连上 WiFi → Chrome 唤醒 Service Worker，从 IndexedDB 镜像队列重放「静默重登 → 照片上传 → 建单」→ **全程无需打开页面，记录自动落表**；下次打开看到「✓ 已落台账」。

## 二、架构与实现（每项独立段落）

### 1. 镜像层（check.html）

Service Worker 读不到 localStorage（会话/待传队列都在里面）⇒ 镜像到 IndexedDB（库 `hse-bg-sync` / store `kv`）两个键：

- `queue`：SW 可重放条目数组 `{id, state(pending|synced|failed), body, photo{dataUrl,cid,needUpload}, assign, serverRecordId, syncedAt, error}`——`body` 由页面 `toPatrolBody` **固化**（含当时的网格解析/照片 token 状态），SW 只做 HTTP 重放、不重复实现业务；`needUpload` 对齐页面 photoFp 口径（换过图 → 旧 token 作废必重传）；派发流程（建单即指派）在 `rec._pendingAssign` 写入 assign 块供镜像。
- `session`：`{token, exp, creds}`（creds 与「记住我」同源同权，未勾选则为 null）。

镜像触发：`saveDB()` 首行 `bgScheduleMirror()`（1.2s 防抖 + 内容签名比对，避免无谓重写）。**铁律**：镜像只在「合并完成」之后重建（`bgMerging`/`bgMirroring` 双互斥），绝不覆盖 SW 夜间落表结果。

### 2. 合并回写（check.html）

`bgMergeFromMirror()`：打开页面时把 SW 落表结果对齐回本机记录——**只升级不降级**：synced 恒采纳（serverRecordId/syncedAt/assigned），failed 仅覆盖 pending（保留页面本地更有用的错误提示）。合并 changed>0 → syncToast「✓ 已补传 N 条记录到飞书台账」。触发点：boot（loadDB 后 await，先于首屏渲染）+ enterOffline（fire-and-forget）+ visibilitychange 回前台。

### 3. SW 重放链路（sw.js）

保留 fetch 纯透传不动，新增 `sync` 监听（tag `hse-patrol-sync`）→ `bgSyncRetry()`：逐条 `bgEnsureAuth`（token 过期 → 镜像 creds 静默重登，与页面「记住我」同口径）→ `needUpload` 则 `/api/mobile/upload`（dataURL→File，client_request_id 同源幂等）→ `/api/mobile/patrol/submit`（+photo_tokens/+assign_to）→ **每条落盘 IDB**（中途被杀不重放已定态）。分类：429/5xx/401/网络错 → pending（可恢复）；其余 4xx → failed 终态（页面可见原因）；401 先静默重登再重放一次。全部 fetch 60s AbortController 超时。收尾 `remain>0` 时 **reject** ⇒ Chrome 按退避自动重试同 tag。

### 4. 方案二兜底：系统通知

`bgNotifyResult`（仅 `Notification.permission==='granted'` 时）：「✓ 自动补传成功 N 条」/「有 N 条待补传，点击打开页面继续」；`notificationclick` 聚焦已开页面或打开 `/check`。授权获取最小侵入：出现 failed 记录后 `bgArmNotifyAsk()` 武装**一次性捕获点击**（借用户手势合法请求），不做打扰式弹窗；未授权则方案一静默工作、方案二不出现。

### 5. 调试口

页面可 `postMessage({type:'hse-bg-sync-run'})` 手动触发 `bgSyncRetry`（真机调试用；生产路径走 sync 事件）。

## 三、验证记录

| 验证项 | 结果 |
|--------|------|
| `node --check sw.js` | PASS |
| check.html 4 个内联块语法解析 | PASS（含 241KB 主块） |
| 冒烟（种子身份进离线模式）：零 JS 语法/引用错误；bgMirrorQueue/bgMergeFromMirror/bgRegisterSync/bgBuildEntry/syncToast 全部 function | PASS |
| SW 注册：`SW registered scope=http://localhost:8899/`（localhost 安全上下文） | PASS |
| 镜像写入路径功能验证：`bgMirrorQueue()` 后从 IDB 读回 session（token 种子值比对） | PASS（MIRROR-SESSION-OK） |
| 修复自伤 bug：bgMirrorQueue 的 finally 误重置 bgMerging（应为 bgMirroring） | 已修，重测通过 |

**局限（真机项）**：Background Sync 真实触发链（关页 → 回网 → SW 唤醒 → 重放）必须在 **Chrome 安卓真机**验证；桌面 Chrome 的 sync 事件在浏览器运行期间也会触发，可作预验。浏览器被强杀/清理后台时 Chrome 可能不唤醒（平台限制）。

## 四、边界与冻结口径

- 兼容矩阵冻结：Chrome/Edge 安卓（及多数 Chromium 内核）= 关页自动补传 + 通知；Firefox/iOS = 自动降级为 CF-WPS-103 的「打开页面补传」（页面侧 `reg.sync` 不存在即静默跳过注册）。
- 幂等三重保障：client_request_id（服务端先查后写）+ 页面单飞锁 + SW 每条落盘，页面与 SW 并发重放绝不建重单。
- 冻结口径已沉淀项目记忆「H5 关页后自动补传（Background Sync，2026-10-16 冻结，CF-WPS-105）」。
- 未触 5876 生产后端、生产计划任务、生产 `.env`、生产表、WPS 写入、身份链/JWT——纯前端静态文件改动。

## 五、遗留待办

1. 【待用户·独立生产操作】发布：**.103/.104/.105 三轮改动累计未发布**——frontend 改动文件（check.html、app.js、sw.js、patrol/records/login/detail）同步到 `_pages_deploy` 后 wrangler pages deploy；发布后必测登录接口 401 而非 405/503。
2. 【待用户·真机】Chrome 安卓真机验证：弱网断网提交失败 → 关页 → 开飞行模式改 WiFi（或直接回网）→ 观察系统通知（若已授权）→ 重开页面确认「✓ 已落台账」；对照 Firefox 手机端确认降级正常。
3. 【提示】用户需在 Chrome 中至少成功登录过一次（凭据已镜像），且建议将 H5「添加到桌面」提升 SW 触发可靠性；未勾选「记住我」时 SW 无法静默重登，只能走通知兜底。
