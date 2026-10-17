# 隐患排查 AI 识别填单 —— 实施设计（CF-WPS-103）

> 目标：手机端 H5 在「上传隐患照片」后，用多模态模型自动回填 **隐患描述 / 整改依据 / 整改建议 / 隐患类别 / 三违判定 / 重大事故隐患判定 / 风险等级**，并**留痕 AI 原始输出**，人工核对后可编辑再提交。
> 对标：用户截图来自**钉钉宜搭「AI 图片上传」组件**（官方 `docs.aliwork.com` 的「AI 智能识别填充」）。它是低代码平台内置能力，不可搬运；本设计为在自有 H5 上自建同等效果。

---

## 0. 已拍板决策（用户 2026-10-16）

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | 三违判定 | **单选：是 / 否**（独立字段，不与隐患级别合并） |
| 2 | 重大事故隐患判定 | **新增独立字段**（单选：是 / 否），**不**与现有「隐患级别（一般/重大）」合并 |
| 3 | 风险等级 | 默认 **4 档**：`重大风险` / `较大风险` / `一般风险` / `低风险`（红橙黄蓝国标；待用户最终确认档位命名） |
| 4 | 整改依据 | 长文本（可编辑） |
| 5 | 整改建议 | 长文本（可编辑） |
| 6 | 飞书加列 | **已授权**在隐患表加 6 列（含留痕列） |
| 7 | 留痕审计 | **AI 原始输出必须存一份**（便于核对人工改了什么） |

---

## 1. 模型选型结论（事实核查，非推测）

**可用 DeepSeek，且极便宜。** 关键事实（2026-10-16 联网核查）：

- 2026-08-21 DeepSeek 上线官方视觉模型 **`deepseek-v4-flash-vision-exp`**（实验性质），经 **官方** `https://api.deepseek.com`（OpenAI 兼容格式）传入图片。
  - ⚠️ **必须认准官方域名 `api.deepseek.com`**。`api.deepseek.international` 等是第三方/非官方，勿用。
  - 支持 base64 内联（≤32 MiB）、外部 URL、Files API 三种图片传入；支持 JSON Output、Tool Calls。
- **不按张数计价**：图片按尺寸换算成 token，**单张最多 384 token**，与文本 token 合并计费。中国区沿用 V4-Flash 费率：
  - 输入 1M token：空闲 1.5 元 / 高峰 3 元（缓存命中 0.05 / 0.1 元）
  - 输出 1M token：空闲 4.5 元 / 高峰 9 元
- **单次识图成本估算**（384 图 token + ~400 提示词 + ~400 输出）：
  - 高峰 ≈ **0.006 元/次**；空闲/缓存命中 ≈ **0.003 元/次**
  - 按 ~70 张/日 ≈ 2100 张/月 ≈ **12 元/月**，量级极低。
- ⚠️ **实验性风险**：官方明确定义为 "Exp / 实验性质"，能力/定价可能调整或下线。生产需：① 设降级与监控；② 抽象 provider 路由，预留 qwen-vl（阿里云百炼）/ Workers AI 兜底。

**密钥**：`DEEPSEEK_API_KEY` 走 `wrangler secret put`（绝不入库、绝不进 `.env` 提交）。

---

## 2. 架构与数据流

```
[前端 check.html 隐患上报表单]
   │  拍照/选相册 → compressImage → dataUrl（已存在 uploadPhotoToken 链路）
   ▼
[点击「AI 识别」] → POST /api/mobile/hazard/ai-fill { image: dataUrl }
   ▼
[Worker] 门：Session 鉴权 → 取 env.DEEPSEEK_API_KEY
   → 调 api.deepseek.com (deepseek-v4-flash-vision-exp)
   → 强约束 JSON 输出（strict schema）
   ▼
返回 { description, basis, suggestion, category,
       threeViolation, majorHazard, riskLevel, raw }
   ▼
[前端] 回填成【可编辑】字段 + 打「AI 生成·请核对」标
   · 隐患描述 → 文本框
   · 整改依据 / 整改建议 → 文本框
   · 隐患类别 → 命中权威枚举则高亮 chip，否则退回手选
   · 三违 / 重大事故隐患 → 单选（是/否）
   · 风险等级 → 单选（4 档）
   · AI 原始输出 → 仅随提交带上，用于留痕（不展示给用户编辑）
   ▼
[原提交链路] /api/mobile/hazard/submit（照片 file_token 不变）
   → feishuTypedRecord 经 FEISHU_FIELD_WHITELIST 过滤 → 飞书隐患表
```

**复用点**：前端已压缩的 `dataUrl` 直接进 AI 接口，无需二次上传、无需飞书 drive 回取；照片仍走既有 `/api/mobile/upload` → `file_token`。

---

## 3. 飞书隐患表 —— 新增 6 列（硬前置）

> 红线约束（`worker/index.js:318-319` + `feishuTypedRecord:685`）：飞书写入「表里不存在的字段名」会**自动补建文本列（列漂移）**，故代码用 `FEISHU_FIELD_WHITELIST`（index.js:323）硬防护，**未知键一律丢弃**。因此这 6 列**必须先建好 + 进白名单**，否则 AI 回填值被静默吞掉。

| 中文列名（飞书侧） | 类型 | 枚举 / 约束 | 用途 |
|---|---|---|---|
| `整改依据` | 多行文本 | 自由文本 | AI 生成，人工可改 |
| `整改建议` | 多行文本 | 自由文本 | AI 生成，人工可改 |
| `三违判定` | 单选 | `是` / `否` | 独立字段 |
| `重大事故隐患判定` | 单选 | `是` / `否` | 独立字段（≠隐患级别） |
| `风险等级` | 单选 | `重大风险`/`较大风险`/`一般风险`/`低风险` | 默认 4 档 |
| `AI识别原始输出` | 多行文本 | JSON 原文 | **审计留痕**，不下发展示 |

**加列执行方式（二选一，需你确认）**：
- **A（推荐，可脚本化）**：新增 `worker/tools/addHazardFields.mjs`，用现有飞书 tenant_access_token 调 `POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields` 批量建列（需飞书应用具备 `bitable:app.field:write` scope）。脚本读 `FS_APP_TOKEN` / `FS_HAZARD_TABLE_ID`（与现有 worker 同一套 env）。
- **B（手动）**：你在飞书网页端隐患表手动加这 6 列（类型/枚举如上），我这边只改代码并登记白名单。

**白名单登记**：在 `worker/index.js:323` 的 `FEISHU_FIELD_WHITELIST` 中加入上述 6 个中文列名（与现有「隐患类别」「隐患描述」等同处登记）。

---

## 4. Worker 改动

### 4.1 新增常量（与 HAZARD_CATEGORIES/HAZARD_LEVELS 同风格，fail-closed）
```js
const HAZARD_THREE_VIOLATION = ['是', '否'];
const HAZARD_MAJOR = ['是', '否'];
const HAZARD_RISK_LEVELS = ['重大风险', '较大风险', '一般风险', '低风险'];
const HAZARD_AI_TIMEOUT_MS = 15000; // 超时即降级
```

### 4.2 新增 `POST /api/mobile/hazard/ai-fill`
- **门**：Session 鉴权（同 upload）、`DEEPSEEK_API_KEY` 缺失 → 返回 `{ai_disabled:true}` 让前端走纯手填。
- **入参**：`{ image: dataUrl }`，校验 dataUrl 格式（data:image/jpeg|png;base64,…）与大小（≤32 MiB）。
- **调模型**：`api.deepseek.com/v1/chat/completions`，model=`deepseek-v4-flash-vision-exp`，`response_format` 强制 JSON，prompt 内嵌 strict schema（输出键：description/basis/suggestion/category/threeViolation/majorHazard/riskLevel）。
- **服务端校验（对齐现有 fail-closed）**：
  - `category` 不在 `HAZARD_CATEGORIES` → 丢弃该字段（退回手选），不污染统计；
  - `threeViolation`/`majorHazard` 不在 `['是','否']` → 置空；
  - `riskLevel` 不在 `HAZARD_RISK_LEVELS` → 置空。
- **返回**：`{ description, basis, suggestion, category, threeViolation, majorHazard, riskLevel, raw }`（`raw`=模型原始 JSON 字符串，用于留痕）。
- **降级**：超时/网络/解析失败 → `{ ai_disabled:true }`，**绝不抛错阻断**。

### 4.3 改造 `hazard/submit`（index.js:3253 起）
- body 新增可选键：`rectify_basis` / `rectify_suggestion` / `three_violation` / `major_hazard` / `risk_level` / `ai_raw`。
- 服务端再校验一遍枚举（防前端绕过），非法值置空。
- 写 `record` 时带上 6 个中文列名 → 经 `feishuTypedRecord` 白名单放行 → 飞书落库。

---

## 5. 前端改动（check.html）

- 隐患上报表单新增 6 个输入区（描述/依据/建议为 textarea；三违/重大/风险等级为单选 chip，复用 `hzOptCard` 样式）。
- 拍照/选图后，若 `DEEPSEEK_API_KEY` 在线（首屏探测或失败时静默），显示「AI 识别」按钮 → 调 `ai-fill` → 回填并打「AI 生成·请核对」角标。
- 回填值**可编辑**；类别命中枚举则高亮对应 chip，否则置空让用户手选。
- 提交时把 6 字段随 `hazard/submit` body 一并发送。
- 详情页（`hazardClosureCardHtml` / `renderDetail`）展示新增字段（只读）。

---

## 6. P0 / P1 分期与验收

### P0（本次交付，含降级）
1. 飞书加 6 列（方式 A 或 B）+ 白名单登记。
2. Worker：`ai-fill` 端点 + 常量 + `hazard/submit` 接收与白名单放行 + 降级分支。
3. 前端：表单 6 字段 + AI 识别按钮 + 回填/核对角标 + 提交携带。
4. `wrangler secret put DEEPSEEK_API_KEY`（你执行，或给安全通道）。

**P0 验收**：
- 真机/Dev：上传一张现场图 → 点 AI 识别 → 6 字段被回填且可编辑，类别命中枚举高亮、不命中退回手选。
- 模拟 `DEEPSEEK_API_KEY` 缺失 / 模型 504 → 前端自动走手填，提交不受影响。
- `cfwps100-hazard-closure.e2e.mjs` 不回归破坏 + 新增 `ai-fill` 单测（mock 模型返回 / 超时 / 非法枚举）。
- 飞书表出现对应 6 列且提交后值正确落库（用 dev 副本或受保护记录之外的测试行验证）。

### P1（后续，本次不强制）
- provider 路由抽象（DeepSeek Exp → qwen-vl / Workers AI 兜底）。
- AI 识别准确率抽检与提示词迭代。
- 留痕列的前端「查看 AI 原文」入口（管理视角）。

---

## 7. 风险与待确认

- ⚠️ **DeepSeek 模型为实验性（Exp）**：定价/可用性可能变；生产需监控 + 降级 + 预留兜底 provider。
- ⚠️ **飞书加列 scope**：方式 A 需确认飞书应用有 `bitable:app.field:write`；无则走方式 B 手动。
- ❓ **风险等级档位命名**：默认用国标 4 档（红橙黄蓝），若你们内部口径不同请告知。
- ❓ **AI 识别入口时机**：默认「拍完照后出现按钮」，若想「拍照后自动识别」可改。
- 🔒 **密钥**：`DEEPSEEK_API_KEY` 必须由你走 `wrangler secret put`，本机/仓库不落明文（对齐红线 §2.2）。
