# MOBILE-RECT-01：移动端三违「整改任务闭环」详细设计

> 状态：设计稿（待业务评审，未开发）
> 日期：2026-09-17
> 关联：E-08 系列（三违记录/扣分）、CF-WPS-13/17/18（H5 巡查链路）、05-H-0（WPS→Pull→PG 单向冻结）

---

## 1. 目的与范围

落地「手机端三违上报 → 整改任务 → 整改拍照 → 反馈确认 → 闭环」全流程。
本设计只覆盖**新增的整改闭环域**；三违上报本身已有正式实现（见 §2.1），不重建。

范围外（明确不做）：
- 不改 E-08 扣分/责任解析链路（E-08-04 冻结）；
- 不改 05-H-0 单向同步方向，不新增任何回流 WPS/飞书基础表的写入；
- 不引入整改扣分规则（如需挂扣分，属授权新需求另立项）。

---

## 2. 现状盘点（代码级证据）

### 2.1 已存在：三违现场录入（MOBILE-05）
- 页面：`安全看板vben/apps/web-naive/src/views/mobile/violation/new.vue`
- 链路：`POST /api/violations`（violationService.create）→ 服务端责任解析 + E-08-11 分层扣分 → `GET /api/violations/:id/evidence-chain` 回显。
- 关键约束已实现：
  - 被检查人从正式员工选择器选取（`GET /api/hse/employee/employees/selector`，PG 主数据），**禁姓名猜 id**；
  - 检查人由服务端按 `req.user` 权威覆盖（E-08-08/09）；
  - 检查来源复用正式枚举 `company / township / self`；
  - 图片复用 `POST /files/upload/image`，相对路径入库 `image_content`；
  - 扣分零前端实现。

**结论：用户方案中「拍现场照片 → 选人 → 选三违标准 → 保存三违」这一段已经是现网能力，无需新建。**

### 2.2 已存在（窄能力）：补传整改照片
- 页面：`mobile/grid/rectify.vue`（HSE-MOBILE-GRID-03-B）
- 只对既有网格巡查记录补传 `rectified_photo + rectifier`，**明确不引入状态机**（页面头注释写明）。
- 可复用其 `photo-group` 上传组件与错误映射模式。

### 2.3 已存在：公网 Worker 链路（与三违无关）
- `grid-mobile-cloudflare/worker/index.js`：`/api/mobile/auth/*`（登录）、`/api/mobile/patrol/*`（网格长巡查文字链，落飞书 Sheet15）。
- 该链路服务「巡查」，不承载「三违 + 整改闭环」。

### 2.4 缺口（本设计要新建的全部内容）
| 缺口 | 说明 |
| --- | --- |
| 整改任务实体 | 无任何任务表/模型 |
| 指派动作 | 「公司管理人员指定责任乡镇/管理员」不存在 |
| 状态机 | 无 待整改→已整改→已确认 闭环状态 |
| 整改反馈与确认 | 无打回/确认/闭环交互 |
| 任务通知 | H5 工作台无任务入口/角标 |
| 稍后整改 | 三违保存后无「生成整改任务」动作 |

---

## 3. 架构裁决

### 3.1 三违事件走 PG 正式链路，不走 Worker/飞书
- 扣分引擎、七态 deduction 模型、evidence-chain 全在 PG 侧；Sheet 15 的「三违行为/涉及人员」字段是**巡查附带描述**，不是三违正式记录。
- 移动端三违一律走 §2.1 既有链路。移动端三违记录因此成为 `source_channel` 可归因的真实来源（当前生产归因候选集恒空），归因接入属后续授权项。

### 3.2 整改任务闭环落 PG（本地业务缓冲层）
- 任务是**双向**业务（指派/接收/反馈/确认），需要事务、状态机、权限过滤——PG 合适；
- 飞书/WPS 侧不建任务表：写了就是双向同步，破坏 05-H-0。如未来要归档到飞书台账，只允许「PG → 推送归档」单向附加通道，另立项。
- 照片沿用本地文件上传惯例（`/files/upload/image` 相对路径），与三违 `image_content` 同语义。

### 3.3 基础数据维护层 = 现有单向同步
- 人员（含班组）来源：`employee` 主数据 + `v_employee_org_full`；「班组表」不新建实体，由组织层级派生（待业务确认班组定义，见 §10）。
- 三违标准库：直接用系统 `violationType` 枚举（MOBILE-05 已如此），与 Sheet 3 三违字段对齐映射仅为报表口径问题，不阻塞本设计。

---

## 4. 数据模型（DDL 草案，仅在 `safety_dashboard_dev` 执行）

```sql
CREATE TABLE rectification_task (
  id                    bigserial PRIMARY KEY,
  violation_record_id   bigint        NOT NULL,   -- 关联三违记录（以 violations 实际表名/主键为准，R1 阶段核对）
  target_type           varchar(16)   NOT NULL CHECK (target_type IN ('org','employee')),
  target_org_id         bigint        NULL,       -- target_type=org：责任乡镇
  target_employee_id    bigint        NULL,       -- target_type=employee：责任人（乡镇经理/管理员本人）
  assigned_by_id        bigint        NOT NULL,   -- 指派人（公司管理人员/乡镇经理）
  assigned_at           timestamptz   NOT NULL DEFAULT now(),
  status                varchar(24)   NOT NULL DEFAULT 'assigned',
  rectified_at          timestamptz   NULL,
  rectifier_id          bigint        NULL,
  rectified_photos      text          NULL,       -- 相对路径，多图分号拼接（沿用 image_content 惯例）
  rectify_remark        text          NULL,
  confirmed_by_id       bigint        NULL,
  confirmed_at          timestamptz   NULL,
  close_remark          text          NULL,
  client_request_id     varchar(64)   NOT NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_rt_client_request UNIQUE (client_request_id),
  CONSTRAINT ck_rt_target CHECK (
    (target_type='org' AND target_org_id IS NOT NULL AND target_employee_id IS NULL) OR
    (target_type='employee' AND target_employee_id IS NOT NULL AND target_org_id IS NULL)
  )
);
CREATE INDEX idx_rt_target_status ON rectification_task (status, target_type, target_org_id, target_employee_id);
CREATE INDEX idx_rt_violation ON rectification_task (violation_record_id);

CREATE TABLE rectification_task_event (          -- 历史快照/审计
  id            bigserial PRIMARY KEY,
  task_id       bigint NOT NULL REFERENCES rectification_task(id),
  action        varchar(24) NOT NULL,             -- assign/rectify/confirm/reject/cancel
  actor_id      bigint      NOT NULL,
  detail        jsonb       NULL,                 -- 打回原因、照片清单等
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rte_task ON rectification_task_event (task_id);
```

要点：
- `client_request_id` 唯一约束 = 防重复提交（沿用 CF-WPS-17 惯例）；
- 无外键硬绑定三违表之前，R1 阶段先核对 `violations` 实际主键类型再定 FK（避免 09-15 类事故）；
- 新表为纯新增，不触碰 18-hash 冻结投影列。

## 5. 状态机

```
assigned（待整改）
   │  整改人提交照片+说明            ┌──────────────────────────┐
   ▼                                │ reject：打回 → 回 assigned │
rectified（待确认）◄────────────────┘   （打回原因入 task_event）
   │  指派人/公司管理确认
   ▼
closed（已闭环）

任意态（未 closed）：assigned_by 可 cancel（记录原因）
```

- 用户方案「立即整改」：乡镇经理保存三违后当场拍照 → 一次提交 rectify+confirm（`rectifier = assigned_by = 本人`，闭环路径缩短为同请求两事件，不做隐藏跳态）。
- 「稍后整改」/「公司管理人员指派」：生成 `assigned` 任务。

## 6. API 契约（挂在现有 `server/app.js`，JWT 鉴权）

| 方法/路径 | 语义 | 权限 |
| --- | --- | --- |
| `POST /api/rectification-tasks` | 指派任务 `{violationRecordId, targetType, targetId, remark, clientRequestId}` | 公司管理角色；乡镇经理限本人班组人员/本乡镇 |
| `GET /api/rectification-tasks?scope=assigned\|created&status=` | 任务列表（scope=assigned 按登录人/所属乡镇过滤） | 登录人只看与己相关 |
| `GET /api/rectification-tasks/:id` | 详情（含事件历史） | 同上 |
| `POST /api/rectification-tasks/:id/rectify` | 提交整改 `{photos[], remark}`；服务端校验 photos 非空、当前用户是整改对象 | 整改对象 |
| `POST /api/rectification-tasks/:id/confirm` | 确认闭环 | 指派人/公司管理角色 |
| `POST /api/rectification-tasks/:id/reject` | 打回 `{reason}`，状态回 assigned | 指派人/公司管理角色 |
| `POST /api/rectification-tasks/:id/cancel` | 撤销（未闭环） | 指派人 |

规则：
- 所有状态流转为**服务端判定**（非法跃迁 409），前端零状态计算；
- 角色命名沿用 E-08-01 口径（`admin/hse_manager/safety_manager` + 乡镇角色），R1 阶段以现网 role 表实际值为准核对；
- 照片上传复用 `POST /api/files/upload/image`，rectify 只收相对路径。

## 7. H5 页面设计

| 页面 | 路径（建议） | 说明 |
| --- | --- | --- |
| 工作台入口 | `mobile/index.vue` 加「整改任务」卡片 | 角标 = 待我整改数量 |
| 任务列表 | `mobile/rectify/tasks.vue` | 两 tab：待我整改 / 我发起的 |
| 任务详情·整改提交 | `mobile/rectify/detail.vue` | 复用 `photo-group`；**必须 ≥1 张整改后照片**才可提交（对齐「必须拍现场照片」的产品纪律） |
| 三违保存成功页联动 | `mobile/violation/new.vue` 成功态 | 增加两按钮：「立即整改」（当场拍照闭环）/「稍后整改」（弹出指派表单：公司角色→选乡镇或管理员；乡镇经理→限本人班组，人员从 selector 选） |

指派表单人员候选：目标为 employee 时走正式员工选择器（与 MOBILE-05 同源，禁手输姓名）；目标为乡镇时列组织树。

## 8. 权限矩阵（初稿，R1 核对角色名）

| 动作 | 公司管理 | 乡镇经理/管理员 | 被指派整改人 |
| --- | --- | --- | --- |
| 指派给任意乡镇/人 | ✅ | ✅ 限本人班组/本乡镇 | ❌ |
| 整改提交 | ❌（除非是被指派人） | ✅（任务指向其本人/本乡镇） | ✅ |
| 确认/打回 | ✅ | 指派人是本人时 ✅ | ❌ |
| 撤销 | ✅ | 仅自己指派的 | ❌ |

## 9. 实施阶段

| 阶段 | 内容 | 门禁 |
| --- | --- | --- |
| R1 | dev 建表（`safety_dashboard_dev`）+ API + API 级夹具测试 | DML 脚本启动断言 `current_database()='safety_dashboard_dev'`，护栏硬拒生产库 |
| R2 | H5 四处改动 + 浏览器 E2E（dev 588x/5173） | 现行 dev 全栈+走查套路 |
| R3 | 生产迁移（独立事务+断言+备份） | **需用户显式授权**；迁移前后记录基线五数 |
| R4（可选） | PC 端任务看板、逾期提醒、飞书单向归档 | 每项独立立项 |

## 10. 待业务确认清单（阻塞 R1 的只有第 1 条）

1. 指派到「乡镇」时谁接单：该乡镇全部管理员可见，首人接单即可？还是必须指定到人？
2. 逾期未整改是否需要提醒/升级，还是本期只做统计展示？
3. 打回是否有次数上限？
4. 任务闭环后是否要在三违记录详情/台账投影中展示闭环状态（涉及 18-hash 冻结投影，若只是前端关联查询则无风险）？
5. 「班组」是否需要独立实体（当前由组织层级派生）？
6. 通知：本期默认工作台角标+列表轮询，是否接受？（推送需额外通道，不建议本期做）

## 11. 红线护栏（开发全程有效）

- ⭐ 含 DML 的脚本必须先 `process.env.DB_NAME='safety_dashboard_dev'` 且启动断言，否则 exit；
- 生产 5876 / 生产库 `safety_dashboard` 只读，写入需 dev 演练 + 显式授权；
- 不写 WPS/飞书基础数据表；18-hash 前 18 列不动，新字段只准末尾追加；
- E-08-04 冻结链路零改动；本闭环独立成域；
- 人员选择只认 `employee.id`/selector，禁姓名、手机号猜测；
- 前端零业务计算（状态、权限、责任全部服务端判定）。
