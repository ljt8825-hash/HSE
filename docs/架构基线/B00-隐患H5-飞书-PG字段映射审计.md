# B00｜隐患 H5 - 飞书 - PG 字段映射审计

> 只读核验。基线 HEAD `9d503d2`。
> 三侧字段均取自**实际结构导出**（H5 请求体契约 / 飞书 fields list / PG information_schema），
> 不依据文档、不依据变量名推测。**字段实际不存在的一律写"未发现"，不补字段。**

---

## 1. 三侧结构规模

| 侧 | 对象 | 字段数 | 取证方式 |
|---|---|---|---|
| H5 | `POST /api/mobile/hazard/submit` 请求体 | **16 个入参** | `index.js:3217-3276` 逐项解析 |
| 飞书 | 表 `tblnyMjxtxjpP08q` | **38 列** | `GET /bitable/v1/apps/.../fields` 实测 |
| PG | `public.hazards` | **46 列** | `information_schema.columns` 实测 |

数量差异本身就说明问题：38 → 46 不是简单包含关系。
下面逐字段比对，结论是 **真正能一对一映射的只有 4 个**。

---

## 2. H5 请求体完整契约（16 项，服务端逐项校验）

| # | 入参 | 类型 | 必填 | 校验规则 | 落地飞书列 |
|---|---|---|---|---|---|
| 1 | `category` | string | ✅ | 必须命中 11 项 `HAZARD_CATEGORIES` | 隐患类别 |
| 2 | `level` | string | ✅ | 必须命中 2 项 `HAZARD_LEVELS` | 隐患级别 |
| 3 | `description` | string | ✅ | 非空，≤500 | 隐患描述 |
| 4 | `location` | string | ⬜ | ≤100 | 隐患位置 |
| 5 | `find_time` | string | ⬜ | `YYYY-MM-DD HH:mm`，非未来；空则服务端补当前时间 | 排查时间 |
| 6 | `latitude` | number | ⬜ | −90~90，非法则**整段丢弃** | 纬度 |
| 7 | `longitude` | number | ⬜ | −180~180，非法则整段丢弃 | 经度 |
| 8 | `photo_tokens` | string[] | ⬜ | ≤3，`^[A-Za-z0-9]{10,120}$`，来自 `/api/mobile/upload` | 现场照片（附件 17） |
| 9 | `rectify_photo_tokens` | string[] | ⬜ | ≤3，同上 | 整改后照片（附件 17） |
| 10 | `rectify_basis` | string | ⬜ | ≤1000 | 整改依据 |
| 11 | `rectify_suggestion` | string | ⬜ | ≤1000 | 整改建议 |
| 12 | `three_violation` | string | ⬜ | 仅「是/否」，不命中则丢弃 | 三违判定 |
| 13 | `major_hazard` | string | ⬜ | 仅「是/否」，不命中则丢弃 | 重大事故隐患判定 |
| 14 | `risk_level` | string | ⬜ | 仅 4 档（红橙黄蓝），不命中则丢弃 | 风险等级 |
| 15 | `ai_raw` | string | ⬜ | ≤4000 | AI识别原始输出 |
| 16 | `client_request_id` | string | ⬜ | 8~64 位 `[A-Za-z0-9_-]` | 备注（格式 `req:<cid>`） |

**另 6 列由 Session 注入，前端无法指定**：隐患编号、排查人ID、排查人姓名、排查人部门、排查人职位、处理状态。

---

## 3. 主映射表（H5 → 飞书 → PG）

| H5 字段 | 飞书字段 | PG 字段 | 是否映射 | 是否必填 | 转换规则 | 当前状态 |
|---|---|---|---|---|---|---|
| —（服务端 `newHazardNo()`） | **隐患编号** | **未发现** | ❌ **断** | — | `YH+yyyymmddHHmmss+4随机` | **PG 无此列，无业务主键** |
| `find_time` | 排查时间 | `hazard_date` | ⚠️ 部分 | 飞书⬜/PG⬜ | 飞书 `YYYY-MM-DD HH:mm` → PG `date` **丢失时分** | 可映射但会截断 |
| `description` | 隐患描述 | `description` | ✅ | 飞书✅/PG✅（NOT NULL） | 原样 | **唯一完全可用** |
| `category` | 隐患类别 | `category` | ⚠️ 部分 | 飞书✅/PG⬜ | 前提：写 PG `category`；**不是** `hazard_category`（后者全空） | 词表需核对 |
| —（同 `category`） | 隐患类别 | `hazard_category` | ❌ | — | — | **110/110 全空** |
| `level` | 隐患级别 | `level` | ⚠️ 部分 | 飞书✅/PG⬜ | 飞书「一般隐患」vs PG 默认「一般」→ **值不同** | **词表冲突** |
| —（同 `level`） | 隐患级别 | `hazard_level` | ❌ | — | — | 110/110 全空 |
| `location` | 隐患位置 | `location` | ✅ | 飞书⬜/PG⬜ | 原样 | 可用（但飞书实际存的是"大柳镇"，语义偏区域） |
| `latitude` | 纬度 | **未发现** | ❌ | — | — | **PG 无经纬度列** |
| `longitude` | 经度 | **未发现** | ❌ | — | — | **PG 无经纬度列** |
| `photo_tokens` | 现场照片（附件 17） | **未发现** | ❌ | — | 飞书是 `file_token` 数组 | **PG 无附件关联；`hazard_attachments` 0 行** |
| `rectify_photo_tokens` | 整改后照片（附件 17） | **未发现** | ❌ | — | 同上 | 同上 |
| `rectify_basis` | 整改依据 | **未发现** | ❌ | — | — | PG 有 `measure`（整改措施）但语义不同 |
| `rectify_suggestion` | 整改建议 | **未发现** | ❌ | — | — | PG 无 |
| `three_violation` | 三违判定 | **未发现** | ❌ | — | — | PG 有 `hazard_type`（全空）语义不同 |
| `major_hazard` | 重大事故隐患判定 | **未发现** | ❌ | — | — | PG 无 |
| `risk_level` | 风险等级 | `risk_level` | ⚠️ 部分 | 飞书⬜/PG⬜ | 飞书 4 档（重大/较大/一般/低风险）vs PG 语义为**风险分级管控的等级** | **语义不同，不可直搬** |
| `ai_raw` | AI识别原始输出 | **未发现** | ❌ | — | — | PG 无 |
| `client_request_id` | 备注（`req:<cid>`） | `remark` | ⚠️ 冲突 | 飞书⬜/PG⬜ | 飞书备注**被幂等键占用**；PG `remark` 是业务备注 | **语义冲突** |
| —（服务端 Session） | 排查人ID | `finder_id` | ❌ | — | — | PG 110/110 全空 |
| —（服务端 Session） | 排查人姓名 | `checker` | ⚠️ 弱 | — | 飞书有 ID + 姓名；PG 只有姓名字符串 | 只能文本匹配 |
| —（服务端 Session） | 排查人部门 | `responsible_dept` | ❌ | — | — | PG 110/110 全空 |
| —（服务端 Session） | 排查人职位 | `post_name` | ❌ | — | — | PG 110/110 全空 |
| —（服务端常量） | 处理状态 | `status` | ❌ **冲突** | — | 飞书 3 值状态机；PG 6+ 值历史词表 | **词表不兼容** |
| —（飞书系统列） | 创建时间 | `created_at` | ❌ | — | 飞书=提交时刻；PG=导入时刻 | **语义不同** |
| —（闭环，assign 写） | 整改人ID / 整改人姓名 / 整改人部门 | `fixer` / `corrector_id` | ⚠️ 弱 | — | PG 只有 `fixer` 姓名（97/110） | 部分 |
| —（闭环，assign 写） | 指派人ID / 指派人姓名 / 指派时间 | **未发现** | ❌ | — | — | PG 无指派概念 |
| —（闭环，assign 写） | 整改期限 | `deadline` / `deadline_date` | ⚠️ 空 | — | — | **PG 0/110** |
| —（闭环，rectify 写） | 整改说明 | `measure` / `rectification` | ⚠️ 语义近 | — | PG `measure` 来自 Excel「整改措施」 | 可近似 |
| —（闭环，rectify 写） | 整改提交时间 | `rectify_date` / `actual_rectify_date` | ⚠️ 空 | — | — | **PG 0/110** |
| —（闭环，review 写） | 验收人 | `verify_user` / `reviewer_id` | ⚠️ 空 | — | — | PG 空 |
| —（闭环，review 写） | 验收时间 | `verify_date` / `review_date` | ⚠️ 空 | — | — | **PG 0/110** |
| —（闭环，review 写） | 验收结论 | `review_result` | ⚠️ 空 | — | — | **PG 0/110** |
| —（闭环，review 写） | 闭环时间 | **未发现** | ❌ | — | — | PG 无独立闭环时间 |
| —（闭环，review 写） | 打回次数 | **未发现** | ❌ | — | — | PG 无 |
| —（无写入方） | 多行文本 | **未发现** | ❌ | — | 飞书默认空白列，无业务语义 | 两端都无意义 |

### 3.1 统计

| 判定 | 数量 | 占比 |
|---|---|---|
| ✅ 完全可用映射 | **2**（描述、位置） | — |
| ⚠️ 部分可映射 / 需转换 / 语义冲突 | **12** | — |
| ❌ 断链（一端无对应列） | **22** | — |
| —（无业务语义） | 1 | — |

> 换句话说：**38 个飞书列里，只有 2 个能直接进 PG。**
> 这不是"字段没对齐"，是两侧建模的对象根本不是同一个东西。

---

## 4. 关键缺失字段清单（任务书 §十一 指定核对的 19 项）

| 要求核对的项 | H5 | 飞书 | PG | 结论 |
|---|---|---|---|---|
| 隐患编号 | 服务端生成 | ✅ 有 | **❌ 无** | **P0：PG 缺业务主键** |
| 隐患日期 | `find_time`（含时分） | ✅ 排查时间 | ⚠️ `hazard_date`（仅日期） | 时分丢失 |
| 隐患描述 | ✅ | ✅ | ✅ | 唯一完全一致项 |
| 风险/隐患等级 | `level` + `risk_level`（两个概念） | ✅ 隐患级别 + 风险等级 | ⚠️ `level`（默认"一般"）+ `risk_level` | 三侧含义不同 |
| 隐患类别 | ✅ | ✅ | ⚠️ `category` 有 / `hazard_category` 空 | 双列混乱 |
| 检查人 | Session | ✅ ID + 姓名 + 部门 + 职位 | ⚠️ 只有 `checker` 姓名 | **无人员 ID** |
| 整改人 | assign 时写 | ✅ ID + 姓名 + 部门 | ⚠️ `fixer` 姓名 | 部分 |
| 整改日期 | rectify 时写 | ✅ 整改提交时间 | ⚠️ `fix_date` 69/110、`rectify_date` 0 | 不一致 |
| 整改措施 | `rectify_suggestion` | ✅ 整改建议 | ✅ `measure` 110/110 | 名称不同但可用 |
| 状态 | 服务端常量 | ✅ 3 值状态机 | ⚠️ 6+ 值历史词表 | **词表冲突** |
| 审核 | — | ✅ 验收结论 | ⚠️ `review_result` 0/110 | PG 无数据 |
| 审核人 | — | ✅ 验收人 | ⚠️ `verify_user` 空 | PG 无数据 |
| 审核时间 | — | ✅ 验收时间 | ⚠️ `verify_date` 0/110 | PG 无数据 |
| 照片 | `photo_tokens` | ✅ 附件列 | **❌ 无** | **附件无法落地** |
| 附件 | 同上 | ✅ 附件列 | **❌ 无** | 同上 |
| 创建时间 | — | ✅ 系统列 | ⚠️ 语义不同（导入时刻） | — |
| 更新时间 | — | ❌ **未发现**（Bitable 有 last_modified 但未导出） | ✅ `updated_at` | 单侧缺失 |
| 来源 | — | ❌ **未发现** | ⚠️ `hazard_source` 默认值 | **两侧都不可靠** |
| 业务组织 | Session 有部门 | ✅ 排查人部门 | ⚠️ `responsible_dept` 空 + `responsible_dept_id` 空 | PG 无组织 |
| 区域/乡镇 | ❌（只有 location 文本 + 经纬度） | ⚠️ 隐患位置实际填"大柳镇" | ⚠️ `township` 0/110 / `area` | **三侧均无规范化区域字段** |
| 人员标识 | Session `sub` | ✅ 排查人ID（11 位） | ⚠️ `finder_id` 0/110 | PG 无人员 ID |

---

## 5. 唯一标识分析（任务书 §十二）

```text
H5 是否有唯一业务编号？
  ✅ 有 —— 但注意：编号由**服务端**生成（newHazardNo），不是前端传入
      格式 YH + yyyymmddHHmmss + 4 位随机（例：YH202610210122321680）
      幂等实际依赖的是 client_request_id（cid），不是这个编号
        ↓
飞书是否保留？
  ✅ 保留 —— 「隐患编号」列（type 1 文本），2/2 行有值
      同时飞书自身有 record_id（技术主键）
        ↓
PG 是否保留？
  ❌ 未保留 —— hazards 46 列中**没有** hazard_no / hazard_code / 编号 任何同义列
      只有一个 `no` 整型序号，来自 Excel「序号」列（1..66，110 行只有 66 个不同值）
        ↓
同步时如何判断新增/更新/重复？
  ❌ 无法判断 —— 没有共同键
      可行的退路只有：以 description 文本做键（importShared 的 conflictKey 就是它）
      但 PG 内部已有 110 行 / 109 个唯一描述 ⇒ 描述本身不是唯一键
```

### 5.1 风险标记

| 编号 | 风险 | 等级 | 依据 |
|---|---|---|---|
| B00-KEY-01 | PG `hazards` 无"隐患编号"列，同步无业务主键 | **P0** | §5 实测 |
| B00-KEY-02 | 唯一退路 `description` 在 PG 内已重复（110/109） | **P0** | `COUNT(DISTINCT description)=109` |
| B00-KEY-03 | `no`（序号）不可作键：110 行仅 66 个不同值，来自多源 Excel 拼接 | P1 | `MAX(no)=66`、多源证据 |
| B00-KEY-04 | 飞书隐患编号无唯一约束，`4 位随机`可撞 | P2 | `index.js:3115` 无重试/查重 |

> 按任务书 §十二：**只标记，不修。**

---

## 6. 幂等对照（三侧）

| 侧 | 幂等键 | 存储位置 | 生命周期 | 是否可跨系统复用 |
|---|---|---|---|---|
| H5 前端 | `client_request_id`（本地生成） | 随请求体 | 单次提交 | 可（随请求带出） |
| 飞书 | 同 `cid`，寄生「备注」列 `req:<cid>` | 文本列 | 随记录永久 | 可读，但需文本解析 |
| Worker 内存 | `sub|cid → recordId` | isolate Map | 5 min / 重启即失 | ❌ |
| Worker 在途表 | `sub|cid → Promise` | isolate Map | 30 s | ❌ |
| **PG** | **无** | — | — | ❌ |

结论：**H5 侧幂等是完整的（三层），PG 侧完全没有。**
若将来做 Feishu→PG，PG 侧必须自建幂等（不能依赖 cid 在备注里的文本格式长期稳定）。
**但这属于 B03 设计议题，本轮不改。**

---

## 7. 类型差异对照

| 维度 | 飞书 | PG | 影响 |
|---|---|---|---|
| 主键 | `record_id`（字符串，如 `recxxxx`） | `bigint`（125..234） | 无法互相引用 |
| 日期时间 | 全部存**文本**（`排查时间` type 1） | `date` / `timestamp` | 需解析，且 PG date 丢时分 |
| 枚举 | type 3 单选（选项由表结构维护） | `varchar` 无约束 | PG 侧可写入任意值 |
| 附件 | type 17（`file_token` 数组） | 无对应 | 需新建附件表或 URL 列 |
| 布尔 | 文本「是/否」 | `boolean`（`is_deleted`/`is_demo`） | 需转换 |
| 人员 | ID（11 位，疑似手机号） + 姓名字符串 | `bigint` 外键 + 姓名字符串 | **ID 类型不同，无法直接关联** |

> 人员 ID 长度实测为 11 位，与手机号一致；而 PG `finder_id`/`checker_id` 是 `bigint`/`integer`。
> 即使拿到飞书 ID，也不能直接写入 PG 外键 —— 中间必须先解决**身份关联口径**（DEC-A0205-12，A02-06 已登记为链首决策）。

---

## 8. 状态词表冲突（最容易被低估的一处）

| 侧 | 取值 | 出现处 |
|---|---|---|
| 飞书（状态机，`index.js:2954-2963`） | `待整改` → `待验收` → `已闭环`（+ 打回） | 服务端常量 |
| 飞书（存量兼容，`hazardStatusNorm`） | 空串 / `整改中` / `已整改` **一律归一为「待整改」** | `index.js:3056` |
| PG（`hazards.status`） | `discovered` 50 / `closed` 60 | 实测 |
| PG（`HAZARD_STATUS` 常量，A02-05） | discovered / rectifying / pending_review / closed / … | `hazardService.js` |
| PG（`accidents.status` 对照） | `已结案`/`closed`/`处理中`/`已上报`/`pending` 5 种混用 | A02-05 已核 |

**中英文 + 3 值 vs 6 值 + 存量脏值归一** —— 这四层叠加，意味着任何自动同步都必须先有一张状态映射表，
而这张表**目前不存在**。且飞书侧的映射规则写在 `hazardStatusNorm()` 里（代码硬编码），不在配置里。

---

## 9. 判定

```text
三侧字段总数            = H5 16 入参 / 飞书 38 列 / PG 46 列
完全可用映射            = 2（隐患描述、隐患位置）
部分可用 / 需转换       = 12
断链（一端无对应）      = 22
共同业务主键            = 不存在（PG 无"隐患编号"列）
可接受的替代键          = 不存在（description 在 PG 内已重复）
状态词表                = 三侧互不兼容，且无映射配置
附件                    = 飞书有、PG 无，无法落地
人员/组织/区域标识      = 飞书有 ID，PG 全空，且 ID 类型不同

→ 结论：Feishu → PG 不是"补一个同步脚本"的工程量，
        而是"先确定 PG 侧要不要长出这些列/表"的建模决策（B02 范围）。
```
