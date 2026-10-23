# SK-001 Excel 数据分析 Skill 交付

- **日期**：2026-10-12
- **类别**：②交付报告
- **任务**：AI-Phase-01-04 / SK-001 Excel 数据分析标准 Skill 实施
- **归属对话**：当前会话
- **主报告**：[AI-Phase-01-04-SK-001-Excel数据分析Skill实施报告.md](../../AI智能分析/AI-Phase-01-04-SK-001-Excel数据分析Skill实施报告.md)

---

## 一、交付摘要

公司**第二个标准公司级 AI Skill**，首个 data_analysis 类型：

| 项 | 值 |
|----|----|
| Skill ID | `SK-001` |
| 名称 | Excel 数据分析 |
| 技术标识 | `company.excel.analysis` |
| 版本 | `v1.0.0` |
| domain / type | `company` / `data_analysis` |
| Status | **Active**（2026-10-12 A~P 验收全过后由 Testing 转 Active） |
| API | `POST /api/company/ai/skills/SK-001/analyze`（multipart） |
| 前端入口 | `/company/excel-analysis`（Naive UI，可见菜单） |

**核心原则（任务书 §八/§四十）：确定性计算优先于 AI。** 全部统计数字由程序计算，AI 只做解释；程序与 AI 数字不一致时以程序为准并出 warning。

调用链：

```text
Excel 文件 → 文件校验 → Workbook 解析 → 表头识别 → 类型标准化
         → 数据质量检查 → 确定性统计 → Analysis Result → Evidence
         → Prompt Registry → AI Gateway → Provider/Model → AI 解释
         → 统一 Skill Output → Generation Record → 前端(Naive UI)
```

## 二、新增文件

| 文件 | 说明 |
|------|------|
| `server/services/ai/skills/companyExcelAnalysis.js` | SK-001 Skill 本体（~770 行：校验/权限/确定性引擎/统计/降载/AI/一致性检查） |
| `server/controllers/companyAiController.js` | 扩展 `analyzeSK001`（multer 内存存储 + 20MB 限制，既有函数不变） |
| `server/routes/company-ai.js` | 扩展 `POST /skills/SK-001/analyze` + `GET /skills/SK-001`（既有 SK-005 端点不变） |
| `安全看板vben/apps/web-naive/src/api/company-ai.ts` | 扩展 `analyzeCompanyExcel`（FormData + 120s 超时）+ 完整 TS 类型 |
| `安全看板vben/apps/web-naive/src/views/company/excel-analysis/index.vue` | 前端分析页（上传/目标/结果区：概况/质量/统计/分组/排名/趋势/异常/AI 解读） |
| `安全看板vben/apps/web-naive/src/router/routes/modules/company-ai.ts` | 新增路由与菜单 |
| `docs/AI智能分析/AI-Phase-01-04-SK-001-Excel数据分析Skill实施报告.md` | 实施报告（28 节） |

## 三、修改文件

| 文件 | 修改内容 |
|------|----------|
| `server/services/ai/aiPromptRegistry.js` | 新增 `COMPANY_EXCEL_ANALYSIS_PROMPT`（key `company.excel.analysis`/v1.0.0/ACTIVE，含铁律 6「字段纪律」） |

## 四、数据库变化

**无 DDL / 无 migration / 无新增表**。复用 `ai_generation_records`（type=`excel_analysis` / sub_type=`SK-001` / prompt_key 最小映射，R2 缺列遗留不变）。

## 五、确定性引擎（无业务规则，§二十九）

- 解析链：`loadWorkbook`（xlsx ^0.18.5 同步读，失败 → `AI_FILE_INVALID`）→ `selectSheet`（优先指定名，否则首个非空表）→ `extractMatrix`（`sheet_to_json header:1 defval:null blankrows:false raw:false`）→ `detectHeader`（前 10 行首个非空格 ≥2；列名去空/去重）→ 类型标准化（number 严格格式含千分位；date 复用 `ExcelUtils`，两位年 m/d/yy → 20yy 假设 = R8）→ 质量检查（空单元格/空值率/完全重复行）→ 确定性统计（sum/mean/min/max、group_by、ranking、trend 月粒度、Z 分数异常）。
- 输入边界：20MB / 5000 行 / 100 列 / 12 统计列 / 4 分组卡 / 4 排名卡 / 10 条目 / 60 趋势点 / 20 异常清单，超限截断并在 quality/truncated 如实登记。
- 无数据行 → 安全返回（success=true / confidence=low / `ai_called=false`，不浪费模型）；无有效表头 → 结构化 `AI_FILE_INVALID`。

## 六、AI 机制与防幻觉三重防线

1. **`relabelForAi` 上下文中文重标签**：送入 AI 的统计上下文全部改为中文字段名（记录条数/XX合计/均值/占比/空值率），根因修复「sums.序号=122 被误述为次数 122」类幻觉。
2. **Prompt 铁律 6（字段纪律）**：引用任何数字必须连同字段含义、所属分组/期间一起表述，严禁把「合计」当「次数」、把 A 期间数字安到 B 上。
3. **`checkAiNumberConsistency` 一致性检查**：AI 回答中提取数字与程序数字集合比对（round4/round2/百分数宽匹配 + 年份 1900~2100 + 行号 ≤ row_count+10），不一致 → 追加 warning「请以 result 确定性计算结果为准」。已知局限（R7）：无法识别「真实数字+错误归属」。

**降载阶梯 `limitAiContext`**：tier2 分组/排名 top3 + 趋势首尾各 6 期；tier3 仅 dataset+quality+statistics_head；`aiContextMaxChars=2400`（≈1300 tokens，prefill ~34s）。校准链：24000 → 4000 → 2400（依据本地 ollama qwen2.5:7b 纯 CPU prefill ≈39 tokens/s、num_ctx=4096、空闲卸载冷启动 +~40s、前端 120s 超时）。**确定性数字始终完整在 result，压缩只影响 AI 解释上下文。**

## 七、权限与记录

- 角色 allowlist（与 SK-005 / `auth.js` ROLE_PERMISSIONS_MAP 逐字一致，fail-closed）：8 角色；身份取 `req.user`，禁请求体传入；文件自包含无行级数据范围。
- 每次执行写 `ai_generation_records`（成功/失败路径均落库，T10 验证）；日志无密钥。
- Model Policy：`provider=null` 交 Gateway 活动 Provider，禁写死（§十五）。

## 八、测试结果

| 编号 | 场景 | 结果 |
|------|------|------|
| T01/T02 | 正常分析+多列（ollama qwen2.5:7b，conf=high，ev=8，91.7s） | PASS |
| T03 | 空值不当 0（mean=20 sum=60 empty=3） | PASS（脚本断言原写 2 系笔误，离线复核实际 3） |
| T04 | 完全重复行识别 dup=3 | PASS |
| T05a/b | 无数据行安全返回 / 无表头 `AI_FILE_INVALID` | PASS |
| T06 | Provider 异常（AI_PROVIDER_NOT_FOUND，retryable=false） | PASS |
| T07 | 权限（no-token=401 / bad-token=401） | PASS |
| T08/T09 | Evidence 同源 db=8 resp=8 / Prompt 追踪一致 | PASS |
| T10a/b | Record 成功 success=10 / 失败 failed=2 带错误 | PASS |
| META | skills 清单 count=2，SK-001 status=Active | PASS |
| REAL | 真实业务 Excel（司机违章台账 191 行×7 列，conf=high，116.3s）+ AI 解读人工核对 | PASS（R7 实例如实登记：2021 年 3 月「3 次」vs 程序 count=2，主结论与其余数字与程序一致；人名已脱敏） |
| 回归 | HSE AI（ai-v2/health 200 + SK-005 answer 200 conf=low 诚实拒答路径） | PASS |
| 前端 E2E | 5889 真实浏览器：渲染/校验/上传/提交/全部结果区块/高置信度/无 JS 错误 | PASS（三轮） |

**最终代码状态全量回归 12/12 PASS。**

## 九、验收 A~P

全部通过（A 文件上传/校验、B 解析、C 表头、D 类型、E 质量、F 统计、G 分组排名、H 趋势、I 异常、J Evidence、K Prompt Registry、L Gateway、M 记录、N 权限、O 前端、P HSE 回归）。

## 十、发现问题与修复

- **P1（已修）**：首轮集成 5 失败全为 AI_TIMEOUT → 根因 = 24000 字符上下文超 CPU prefill 能力且超 num_ctx 被静默截断 → 上下文预算校准链（终值 2400）+ 开发后端进程级 `AI_TIMEOUT_MS=240000`（不改 .env）。
- **P2（已修）**：REAL AI 幻觉「违章次数 122 次」（实际 count=5）→ `relabelForAi` + Prompt 铁律 6 + `checkAiNumberConsistency` 三重防线 → 复核幻觉消除。
- **P3（已修，真实缺陷）**：前端 E2E 上传报「AI_INVALID_REQUEST 缺少上传文件」→ `requestClient` FormData 必须显式 `headers: {'Content-Type': undefined}`（与 `hse/batch-import.ts` 同范式），否则默认 JSON Content-Type 致 multer 解析不到 multipart——影响所有真实用户。
- **P4（已修）**：前端提交 ECONNABORTED（120s）→ 冷启动 +40s 叠加 → 2400 字符预算 + 提交前预热模型 → 60.3s 通过。
- **P5（脚本）**：T03 断言 `empty_cells===2` 写错，实际文件 3 个空单元格 → 改断言 ===3，非代码缺陷。

## 十一、遗留风险（新增 R6~R8，延续 R1~R5）

| 风险 | 内容 | 状态 |
|------|------|------|
| R6 | 本地 CPU 推理慢（prefill ≈39 tokens/s）+ 冷启动 +~40s，120s 超时边界；已用 2400 字符预算缓解；生产远端 Provider 无此约束 | 已缓解 |
| R7 | AI「真实数字+错误归属」幻觉无法被一致性检查捕获；三重防线缓解，残余风险低但存在（REAL 测试有实测实例） | 持续观察 |
| R8 | 两位年日期解析假设 m/d/yy → 20yy，若真实为 d/m/yy 将误判 | 待用户确认口径 |

## 十二、边界声明

未触碰 5876 生产端口/计划任务 `HSE-Backend`/生产 `.env`/生产表/WPS 写操作/身份链（users.employee_id / employee / employee_assignment / JWT）；开发用 5881/5889 临时端口；未新增 npm 依赖；未复用 utils/excel.js 别名映射段（强 HSE 耦合，01-00 §12）。

## 十三、完成与停止

A~P 全过 → SKILL_STATUS 由 Testing 转 Active（重启后端 META 验证 `count=2 SK-001 status=Active`）。

**按任务书 §三十八：完成后停止，不进入 SK-002~SK-004 / Agent 开发。**
