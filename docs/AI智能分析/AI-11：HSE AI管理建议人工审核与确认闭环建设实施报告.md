# AI-11：HSE AI 管理建议人工审核与确认闭环建设实施报告

- **阶段**：AI-11
- **日期**：2026-09-15
- **执行环境**：开发库 `safety_dashboard`（migration + 测试数据，已清理）；开发后端 5881（临时验证，已重启加载新代码）；生产 5876 / 生产库 / 生产 .env / 生产 worker 零触碰
- **任务书要点**：先审计 → 再设计 → 判断是否需要数据库结构；如需新增表/字段/migration → **先输出 NEED USER CONFIRMATION，经用户确认后方可编码**；AI 原始建议不可覆盖；人工意见独立可追溯；AI 永不进入 HSE 最终决策链；不碰 Workbuddy；不碰生产；不修历史 60 个 TS 错误；不激活 DRAFT Prompt；AI-11 完成后立即停止。

---

## 1. 执行摘要

**AI-11 结论：PASS（完成，51/51 测试通过）。**

本阶段按「审计 → 设计 → 确认 → 编码 → 测试」闭环完成：

1. **审计**（只读 information_schema 实测）：`ai_generation_records`（20 列）/ `ai_analysis_tasks`（23 列）均无任何审核字段；全库 review/approval/audit/confirm/checked/manual 约 100 个字段全部归属其他业务域，**无一可复用** → 正式实现需要 migration。
2. **方案确认**：按任务书 §7 先输出 NEED USER CONFIRMATION，用户确认采用 **方案 C（独立审核表 `ai_generation_reviews`）** 后，才在开发库执行 migration（未在确认前编码）。
3. **Migration（仅开发库）**：新建 `ai_generation_reviews` 表（12 列、2 外键、4 业务索引 + 主键），幂等；`ai_generation_records` / `ai_analysis_tasks` 结构零改动（列数保持基线 20/23）。
4. **后端**：`aiReviewService`（四态状态机 / previousStatus 乐观并发 / SELECT FOR UPDATE 串行化 / 幂等重试 / 形状校验 fail-closed / 审核人姓名 join）+ controller + routes（写 requireRole(admin,safety_manager)，读任意登录用户）。
5. **前端**：`ai.ts` 类型与接口 + `index.vue` 人工审核区块（状态 / 审核人 / 时间 / 历史 / 人工意见 / MODIFIED 独立展示 / 权限按钮 / 冲突刷新）。
6. **测试**：Unit 19/19、Integration 20/20、Route 5/5、Frontend 7/7 = **51/51**；测试数据清理残留 0；TypeScript AI-11 新增错误 = 0（历史 60 处不触碰）。

## 2. AI-10 基线审计（承接前置阶段）

- AI-10 测试统计已在 AI-11 前置阶段更正：`Unit 41 + Integration 15 + Route 5 + Frontend 5 = 66/66`（AI-10 报告原「Total: 25/25」数学关系错误，历史报告原文保留未篡改、未重跑）。
- AI-10 能力基线（AI-11 复用起点）：
  1. 建议生成落库 `ai_generation_records`：`type='analysis'`、`sub_type='management_suggestion'`、`title='管理建议:任务#{taskId}'`、`result`=AI 原始 JSON 文本、`evidence`=证据数组。
  2. 读取：按 title 关联键查最新一条记录，`parse + validate + assertBoundary` 后返回六字段协议（overall_assessment / priority_issues / management_actions / monitoring_points / follow_up_suggestions / limitations）。
  3. 权限：写（生成）= `requireRole('admin','safety_manager')`；读 = 任意登录用户；角色枚举含 grid_inspector 等。
  4. AI unavailable：HTTP 200 + available=false + 统计保留，不 500、不伪造。

## 3. 数据库方案判定与用户确认（任务书 §7 强制停止已执行）

| 方案 | 内容 | 判定 |
|------|------|------|
| A：JSONB 复用 result/evidence | 零 migration | 破坏 AI-10 result 解析、语义耦合、并发/历史无保证，**不推荐** |
| B：ai_generation_records 加 4 列 | 最小 ALTER | 仅保留最新审核、无历史/前后状态，备选 |
| **C：独立表 ai_generation_reviews** | 1 张新表 + 索引 | **推荐：满足全部核心要求（可追溯/审计/多次审核/并发一致/原始结果隔离）** |

- **执行过程**：本阶段先输出 NEED USER CONFIRMATION 报告（方案 C/B/A 供选），用户确认采用方案 C 并授权开发库 migration 后，才创建表、编码。
- **状态名审计**：沿用 `ai_analysis_tasks.status` 大写常量风格 → `PENDING_REVIEW / APPROVED / REJECTED / MODIFIED`；动作 `APPROVE / REJECT / MODIFY`。

## 4. 数据库变更（migration：ai11_generation_reviews_v1.sql）

**migration：是（用户已确认方案 C，仅开发库执行）。**

文件：`server/sql/ai11_generation_reviews_v1.sql`（幂等：CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS）
执行脚本：`server/scripts/ai11_migration.cjs`（执行前打印 DDL 全文 → 执行 → 验证表/列/FK/索引 → 验证原 AI 表列数不变）

```sql
CREATE TABLE ai_generation_reviews (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  generation_record_id BIGINT NOT NULL REFERENCES ai_generation_records(id) ON DELETE CASCADE,
  task_id              BIGINT NOT NULL REFERENCES ai_analysis_tasks(id) ON DELETE CASCADE,
  review_status        VARCHAR(32) NOT NULL,   -- PENDING_REVIEW/APPROVED/REJECTED/MODIFIED
  previous_status      VARCHAR(32),            -- 审核前状态（追加式历史链）
  action               VARCHAR(32),            -- APPROVE/REJECT/MODIFY
  reviewed_by          BIGINT,                 -- users.id（不做身份推断）
  reviewed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  human_remark         TEXT,                   -- 人工意见（可空）
  human_modified       JSONB,                  -- MODIFIED 时人工修改后的六字段建议（独立存储）
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 索引：idx_ai_generation_reviews_generation_record(generation_record_id, id)
--       idx_ai_generation_reviews_task(task_id, id)
--       idx_ai_generation_reviews_reviewed_by(reviewed_by)
--       idx_ai_generation_reviews_status(review_status)
```

验证结果（migration 脚本实测输出）：

| 验证项 | 结果 |
|--------|------|
| 目标数据库 | `safety_dashboard`（开发库） |
| 表列数 | 12 列（id / generation_record_id / task_id / review_status / previous_status / action / reviewed_by / reviewed_at / human_remark / human_modified / created_at / updated_at） |
| 外键 | 2（generation_record_id → ai_generation_records ON DELETE CASCADE；task_id → ai_analysis_tasks ON DELETE CASCADE） |
| 索引 | 4 业务索引（按 generation_record / task / reviewed_by / status）+ 主键索引，pg_indexes 共 5 |
| 原 AI 表零改动 | ai_generation_records = 20 列（基线）、ai_analysis_tasks = 23 列（基线） |
| 并发策略 | 本表不加唯一约束；由服务层事务 + 任务行 `SELECT ... FOR UPDATE` 串行化保证（见 §6） |

**生产库 `safety_dashboard_dev`：零改动。** 生产 migration 需用户另行独立授权，本阶段不执行。

## 5. 状态机（已实施）

```text
             ┌──────────────┐
  生成后 ───►│ PENDING_REVIEW│◄── AI 已生成，尚未人工处理（无审核记录时的默认语义）
             └──────┬───────┘
     ┌──────────────┼────────────────┐
     ▼              ▼                ▼
 APPROVED      REJECTED          MODIFIED
（确认采纳）    （驳回）        （修改后采纳：human_modified 独立存储）
     │              │                │
     └──────► 均仅记录人机协同结果，不触发任何业务闭环 ◄────┘
```

- 每次审核追加一行，`previous_status` 记录审核前状态，**最新一行 = 当前有效状态**（追加式历史，天然回答「谁 / 何时 / 审核前 / 审核后」）。
- 语义红线（已实现为硬约束）：APPROVED ≠ 自动执行；MODIFIED ≠ 自动写入考核/扣分/隐患/三违/风险等级/人员责任任何业务最终字段（AI 永不进入 HSE 最终决策链）。

## 6. 后端实现

### 6.1 服务层 `server/services/ai/review/aiReviewService.js`（新增）

核心不变量与流程：

1. **请求形状校验前置（fail-closed，与数据库状态无关）**：非法 action → `AI_REVIEW_INVALID_ACTION`；人工意见超长（>2000）→ `AI_REVIEW_OVERSIZED`；MODIFY 缺 humanModified → `AI_REVIEW_REQUIRED`；humanModified 非六字段/类型错/超长 → `AI_REVIEW_INVALID_MODIFIED`。
2. **事务串行化**：`SELECT id FROM ai_analysis_tasks WHERE id=$1 FOR UPDATE` 锁定任务行 → 同一任务的人工审核提交串行化；任务不存在 → `AI_TASK_NOT_FOUND`。
3. **定位 AI 管理建议记录**：AI-10 title 关联键 `管理建议:任务#{taskId}`；无记录 → `AI_REVIEW_RECORD_NOT_FOUND`（AI 建议不存在时不得伪造审核）。
4. **幂等重试**：与最新记录（action + reviewed_by + human_remark + human_modified）完全一致 → `idempotent=true` 原样返回，不新增历史（网络重试安全）。
5. **乐观并发**：请求携带 `previousStatus` 与服务器当前状态不一致 → `AI_REVIEW_STATE_CONFLICT`（基于旧视图提交被拒）；当前已是目标状态且非幂等 → `AI_REVIEW_STATE_CONFLICT`（禁止最后写入覆盖前一个结论）。
6. **硬性不变量**：永不 UPDATE `ai_generation_records.result / evidence / prompt_key / prompt_version`；human_modified 独立 JSONB 列存储，仅作人工参考建议。
7. **审核人**：一律取 `req.user.id`（身份链权威口径），不做姓名/角色推断；响应中 `reviewedByName` 通过 LEFT JOIN users 只读补全。

### 6.2 控制器 + 路由（`server/controllers/aiAnalysisTaskController.js` 增补、`server/routes/ai-v2.js` 增补）

```text
POST /api/hse/ai/v2/analysis-tasks/:id/management-suggestions/review  提交人工审核（写）
GET  /api/hse/ai/v2/analysis-tasks/:id/management-suggestions/reviews 查询审核历史（读）
```

- 错误模型：沿用统一 AI 错误模型（HTTP 200 + `{success:false, error:{code,...}}`）。
- 请求体：`{ action, humanRemark?, humanModified?, previousStatus? }`；响应：`{ success, idempotent, review: {...}, taskId, generationRecordId }`。

## 7. 权限矩阵（已实施，实测 5 项 Route 用例）

| 操作 | admin | safety_manager | grid_inspector | 未认证 |
|------|-------|----------------|----------------|--------|
| 查看 AI 管理建议（AI-10 既有） | ✓ | ✓ | ✓ | ✗ 401 |
| 查看审核历史（GET reviews） | ✓ | ✓ | ✓ | ✗ 401 |
| **提交人工审核（POST review）** | ✓ | ✓ | **✗ 403** | ✗ 401 |

- 审核权限沿用 `requireRole('admin','safety_manager')`（与 AI-10 生成权限一致），**不因 GET 开放而自动扩大**（任务书 §十）。
- 实测：grid_inspector POST → 403；未认证 POST → 401；grid_inspector GET → 200；未认证 GET → 401；任务不存在 POST → `AI_TASK_NOT_FOUND`。

## 8. 前端实现

### 8.1 `安全看板vben/apps/web-naive/src/api/hse/ai.ts`（增补）

```ts
export type ReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'MODIFIED';
export type ReviewAction = 'APPROVE' | 'REJECT' | 'MODIFY';
export interface AiReviewRecord { id; generationRecordId; taskId; reviewStatus; previousStatus; action; reviewedBy; reviewedByName; reviewedAt; humanRemark; humanModified; createdAt; updatedAt; }
submitManagementSuggestionReview(id, { action, humanRemark?, humanModified?, previousStatus? })
getManagementSuggestionReviews(id)
```

### 8.2 `安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue`（增补人工审核区块）

- **AI 管理建议**（AI-10 六字段，只读展示 AI 原始内容）与 **人工审核**（状态 / 审核人 / 审核时间 / 人工意见 / 审核历史链 / MODIFIED 修改内容）两个独立区块，**硬分离，不把人工修改伪装成 AI 输出**（任务书 §十四/§十六）。
- 状态标签复用 `HseStatusTag`（`REVIEW_STATUS_MAP` 四态映射）；组件复用 `NDivider / NText / NSpin / NButton`（Naive UI，未引入 Ant Design Vue）。
- 操作按钮按权限显示（`hasAccessByRoles(['admin','safety_manager'])`）：**确认采纳 / 驳回 / 修改后采纳**。
- 乐观并发：提交携带 `previousStatus`；收到 `AI_REVIEW_STATE_CONFLICT` → 刷新重试提示，不静默覆盖。
- MODIFIED 展示：人工修改后的建议标注为「人工修改建议（非 AI 原始输出）」，与 AI 输出区分。

## 9. Evidence 与 AI 原始结果隔离

- AI-10 既有 Evidence 链路**零改动**：`管理建议 → ai_generation_records → title → ai_analysis_tasks#{id} → statisticsSnapshot → business_record / knowledge_base`。
- 人工审核作为 **Human Review** 独立追加在 AI 结果之后；`ai_generation_reviews.generation_record_id → ai_generation_records.id` 可追溯「人工意见基于哪份 AI 建议及证据」。
- 实测（Integration 用例）：审核全流程后 `ai_generation_records.result / evidence / provider / model / prompt_key / prompt_version` 与 seed **完全一致**（零改动）；MODIFIED 的人工修改存 `human_modified` 独立列，AI result 未变。

## 10. 测试（全部通过，数据已清理）

测试脚本：`server/scripts/ai11_test_unit.cjs`（纯函数，不依赖 DB）、`server/scripts/ai11_test_e2e.cjs`（Integration/Route/Frontend，依赖开发后端 5881）。

### 10.1 结果总览

| 套件 | 通过 | 总数 |
|------|------|------|
| Unit | 19 | 19 |
| Integration | 20 | 20 |
| Route | 5 | 5 |
| Frontend | 7 | 7 |
| **Total** | **51** | **51** |

### 10.2 覆盖要点

- **Unit（19）**：四态常量、三动作、ACTION_TO_STATUS 映射、六字段协议一致性、recordTitle 关联键、validateHumanModified（合法/缺字段/类型错/超长/元素过多）、assertRemarkSize（空/合法/超长/非字符串）、toApiReview 映射与空值兜底。
- **Integration（20）**：GET 建议可用 → 无审核 PENDING_REVIEW 空历史 → APPROVE（审核人/意见留痕）→ 历史含 reviewedByName → 幂等重试不新增 → 已 APPROVED 再 APPROVE 冲突 → previousStatus 过期冲突 → REJECT（safety_manager 姓名解析）→ 历史链连续 → 并发不同动作恰一成功一冲突 → 历史无丢失 → 非法 action / MODIFY 缺 humanModified / humanModified 缺字段 / 意见超长 全部 fail-closed → 校验失败无脏写 → AI 原始结果零改动 → human_modified 独立列且 AI result 未变 → 无建议记录任务 GET 不伪造 / POST 拒绝。
- **Route（5）**：grid_inspector 写 403、未认证写 401、grid_inspector 读 200、未认证读 401、任务不存在 → AI_TASK_NOT_FOUND。
- **Frontend（7）**：审核区块与三操作按钮、状态/审核人/时间/意见展示、权限按钮、乐观并发（previousStatus + 冲突刷新）、人工修改与 AI 输出区分、ai.ts 类型与接口、previousStatus 参数。

### 10.3 测试数据清理

```text
[cleanup] reviews deleted=3
[cleanup] suggestion records deleted=1
[cleanup] tasks deleted=2
[cleanup] generation records deleted=0
[cleanup] sm user deleted=1
[cleanup] residual: {"sm":"0","tasks":"0","recs":"0","reviews":"0"}   ← 残留 0
```

测试用户 `ai11_test_sm`（AI11_TEST 标记）、任务、建议记录、审核记录全部按 id 跟踪删除；未写三违/网格/WPS/考核/扣分任何业务数据。

## 11. TypeScript

- `npm run typecheck`（vue-tsc --noEmit --skipLibCheck）复跑，输出 `server/scripts/_ai11_typecheck_out.txt`。
- **AI-11 新增错误 = 0**（AI-11 触碰文件 `views/hse/ai-analysis/index.vue`、`api/hse/ai.ts` 命中 0）。
- 复跑中发现并修复 1 处 AI-11 新引入错误：`latestReview` 计算属性对 `reviews[reviews.length-1]` 索引访问在 vue-tsc 下可能返回 `undefined`，已用 `?? null` 兜底；修复后复跑全量 60 处（= 历史基线 60，AI-11 触碰文件 0）。
- 历史 60 处既有错误（assessment-*/meeting-records/employee/training/site/grid 等，AI-11 未触碰文件）按任务书要求**不越界修复**，保持原状。

## 12. 边界合规

| 边界 | 结果 |
|------|------|
| 生产端口 5876 / 生产 .env / 生产 worker | 零触碰（开发验证仅用 5881） |
| 生产库 migration/字段 | 零改动（migration 仅开发库 safety_dashboard，生产需另行授权） |
| Workbuddy 保护区域 | 零触碰（WPS/grid*/wpsGrid*/violations/ruleEngine/assessment/sanwei*/views/site/violation/* 均未修改，未写入任何业务数据） |
| Prompt 状态 | `hse.data.analysis v1.0` 与 `hse.management.suggestion v1.0` 保持 DRAFT，未激活 |
| AI 原始结果 | 永不被审核覆盖（实测零改动） |
| AI_TIMEOUT_MS | 保持 60000 未改；已审计：人工审核接口为纯 DB 写操作，**不经 AI Gateway、不受 AI 生成超时影响** |
| Git | 未执行 reset/checkout/clean/restore，未删除 Workbuddy 未提交修改 |
| 历史统计 | AI-05 57/57 vs 51 历史矛盾保留未改；AI-10 报告原文保留 |
| 身份边界 | 审核人一律取 req.user.id，未做姓名/岗位/乡镇推断 |

## 13. 风险与待办

1. **[治理遗留] AI_TIMEOUT_MS=60000 与 CPU qwen2.5:7b 实际耗时（分析 60~125s、建议 143s）不匹配**：已审计确认人工审核链路不受影响；是否调整超时需用户独立授权，AI-11 不改 .env。
2. **[治理遗留] vue-tsc 全量 60 处历史错误**：AI-11 未触碰，不越界修复。
3. **方案 C 并发策略说明**：`ai_generation_reviews` 未加唯一约束（避免限制未来合法的重复状态流程），并发最终状态由「任务行 FOR UPDATE 串行化 + previousStatus 乐观校验」保证，实测并发不同动作恰一成功一冲突、历史无丢失。
4. **生产放行**：生产库执行 `ai11_generation_reviews_v1.sql`、生产 worker 加载新代码、生产 AI 启用，均需用户独立授权后另行执行（本阶段不做）。
5. **AI-05 57/57 vs 51 历史统计矛盾**：继续保留，未修改。
6. **人工审核不进入业务闭环**：审核状态仅记录人机协同结果；若未来需将 APPROVED/MODIFIED 结果推送至业务域（整改/考核等），需新阶段独立设计（AI-12 及以后），本阶段明确禁止。

## 14. 修改/新增文件清单

| 文件 | 变更 |
|------|------|
| `server/sql/ai11_generation_reviews_v1.sql` | 新增：AI-11 migration（幂等 CREATE TABLE + 索引，仅开发库） |
| `server/scripts/ai11_migration.cjs` | 新增：migration 执行与验证脚本（表/列/FK/索引/原表零改动） |
| `server/services/ai/review/aiReviewService.js` | 新增：人工审核服务（状态机/事务锁/乐观并发/幂等/校验/姓名 join） |
| `server/controllers/aiAnalysisTaskController.js` | 修改：增补 submitReview / getReviewHistory |
| `server/routes/ai-v2.js` | 修改：增补 POST review（AI_WRITER）/ GET reviews |
| `server/scripts/ai11_test_unit.cjs` | 新增：Unit 测试（19 项） |
| `server/scripts/ai11_test_e2e.cjs` | 新增：Integration/Route/Frontend 测试（32 项） |
| `安全看板vben/apps/web-naive/src/api/hse/ai.ts` | 修改：AI-11 类型（ReviewStatus/ReviewAction/AiReviewRecord）+ submit/get 接口 |
| `安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue` | 修改：人工审核区块（状态/审核人/时间/历史/意见/权限按钮/冲突刷新/MODIFIED 区分） |
| `docs/AI智能分析/AI智能分析实施进度.md` | 修改：项目状态切换 + AI-11 完成记录段 |
| `docs/AI智能分析/AI-11：HSE AI管理建议人工审核与确认闭环建设实施报告.md` | 修改：本报告（BLOCKED → 完成版） |

## 15. 最终结论

**AI-11：PASS（完成）。**

- 是否需要 migration：**是**（方案 C，用户已确认，仅开发库执行；生产库留待独立授权）。
- 人工审核闭环已落地：谁（reviewed_by/姓名）/ 何时（reviewed_at）/ 审核前（previous_status）/ 审核后（review_status）/ 做了什么（action）/ 人工意见（human_remark）/ 人工修改（human_modified 独立 JSONB）全部持久化、可追溯。
- AI 原始建议零改动；AI 永不进入 HSE 最终决策链；人工审核不自动触发任何业务闭环。
- 测试 51/51、残留 0、TS 新增错误 0；生产/Workbuddy/DRAFT Prompt/Git 边界全部合规。

**按任务书最终停止条件：AI-11 已完成，立即停止，不自行开始 AI-12。本报告与《AI智能分析实施进度.md》等待 ChatGPT 审计。**

---

*AI-11 全部完成，等待审计。*
