# HSE Dashboard · 会话概览（2026-09-13 · 04-E-B）

**阶段**：P2-B1-D / 04-E-B — Revoke UI 最小实施
**状态**：`PHASE_..._04-E-B_IMPLEMENTED` ｜ 04-A→04-E-A 全链 ✅

## 一、交付内容（严格两文件，后端零改动）

| 文件 | 修改 |
|---|---|
| `api/hse/grid-attribution.ts` | +`revokeRecord()`：DELETE `/revoke`，请求体**仅 `{record_id}`**（DECISION-01=A：reason 不进 UI） |
| `views/site/grid/attributed/index.vue` | +操作列（fixed:right）：仅 `manual_confirmed` 行显「撤销归属」（attributed 行 `-`）；`dialog.warning` 五要素二次确认（DECISION-02=A）；三错误码映射；finally 一律重查，不本地改行状态、不重试 |

## 二、验证（E2E 35/35 + typecheck 60=基线）

- 请求体逐字节 `{"record_id":7470}`；取消路径零请求；
- DB：pending / inspector NULL / grid NULL；audit_record `action='revoke'`、**old_value=真实旧值**、同事务（04-E-A 审计结论的运行时再证）；
- pending 页回流（待处理数量：1）；grid_inspector 页面不可达 + 真实 DELETE **403**；
- dev 测试数据按标记清理，五项基线恢复：gir=2061 / max_id=7192 / pending=0 / audit=0 / sync_map=2061；
- 生产零写入：连接路径全 dev + 计数器 A/B 甄别（生产自身 Scheduler 活动）。

## 三、✅ DEF-B 已修复（用户单独授权，同日）

discrete API 主题倒置（`adapter/naive.ts` 不解析 auto）已修：改用 `usePreferences().isDark`（与页面 `html.dark` 同语义）。**双模式验证全过**：auto+浅色 对比度 221、auto+暗色 219（修复前浅色仅 2）；04-E-B E2E 全量回归 PASS、typecheck 60=基线。惠及全部 8+ 既有 discrete 弹层页面。

## 四、边界守住

`.env` mtime 不变、`5876→23396` 未动、server 零新增改动、WPS/Scheduler/Pull 零触碰、无 DDL/无生产 DML。

## 五、待你决定

1. 生产重启 23396（R2 + 04-B/04-D-B/04-E-B/DEF-B 生产生效唯一途径）
2. stamping 生产 apply（产生真实 pending/已归属数据）
3. G2（/pending 真分页）；H1 已明确暂缓

## 交付物

- 报告：`docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-D-IMPLEMENTATION-04-E-B-REPORT.md`
- 截图：`.workbuddy/tmp/shots-04eb-e2e/`（列表操作列 / 弹窗暗色可见 / 撤销后列表 / pending 回流）
- 谱系：04-D-A ✅ 04-D-B ✅ 04-E-B ✅（Revoke 闭环全部就绪，待真实数据）
