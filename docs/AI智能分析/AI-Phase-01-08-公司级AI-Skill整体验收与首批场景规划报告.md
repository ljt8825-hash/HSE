# AI-Phase-01-08 · 公司级 AI Skill 整体验收与首批场景规划报告

| 项目 | 内容 |
| --- | --- |
| 报告日期 | 2026-10-14 |
| 阶段 | AI-Phase-01-08（验收与规划阶段，**纯审计，零开发**） |
| 审计对象 | SK-001~SK-005 五个公司通用 Skill 全量代码与运行体系 |
| 最终结论 | **PASS\***（T01~T16 全部完成、组合 A~E 全闭环、场景池与集团候选规划完成；5 项 C 类差异记录在案、非阻断，见 §25） |
| 关联文档 | AI-Phase-01-00~01-07 八份报告（docs\AI智能分析\）+ 北控城市资源集团东部区域 AI 应用案例常态化征集通知 |
| 报告撰写 | AI（TRAE），待用户复核 |

---

## 1. 执行摘要

按 AI-Phase-01-08 任务书对公司级五个 Skill（SK-001 Excel数据分析 / SK-002 文档解析 / SK-003 检查数据分析 / SK-004 报告生成 / SK-005 企业知识问答）完成**整体审计、组合验证、真实业务验证、能力边界确认与首批 AI 应用场景规划**。全程**零开发**：无新 Skill、无 Agent、无 Orchestrator、无 Migration、无新 npm 依赖、未触碰 HSE AI 核心 / WPS / 登录 JWT / Vben Core / 生产 5876 / 生产表写入。

核心结果：

- **统一架构成立**：T02~T07 六项基础审计全部通过——Prompt Registry 5/5（v1.0.0）、Gateway 5/5（provider=null，零直连）、Evidence 4/5+1 例外、Generation Record 统一落库（R2 缺口只审不改）、权限 8 角色逐字一致 fail-closed、Provider 边界零违例；
- **组合 A~E 全部闭环**（本阶段最重要技术验证）：A/E 复用既有留档（record 130→131→132、141/143），B/C/D 为本阶段真实实测（record 169~173），衔接可靠；组合 C 实证 SK-005 **诚实拒答**防幻觉边界正确；
- **真实业务验证**：grid_inspection_records 3228 行核数一致；真实司机违章台账（191 行）、真实制度 docx（9 标题/102 段/2 表）全链路实测通过；六部门 Data Gap 按有表清单证据盘点（355 表中业务相关 133），无表场景一律记录不编造；
- **重要发现（以代码为准）**：SK-003/SK-004 代码状态为 `Testing`（companyInspectionAnalysis.js L56、companyReportGenerate.js L41），与 01-06/01-07 报告声明的「Active」不符，记 C 类差异；SK-005 无 SKILL_STATUS 常量、manifest 缺 status 字段；组合 D 事实利用率偏低（facts_used=1）；
- **首批场景规划**：六部门场景池评估完毕，按冻结评分模型评出第一批 ≤10 项（A 类 3 / B 类 5 / C 类 1），集团 5 候选成熟度 L0~L6 判定完成。**第一优先级案例：检查巡查智能分析与报告生成（组合 E 链路，L4~L5）**。

效率量化：AI 耗时全部为实测值（record duration）；**人工耗时为业务评估档位，精确基线待实测**——所有效率提升百分比一律不写，遵守 §三十六「不虚构数据」。

## 2. 审计范围

### 2.1 审计对象与依据

| 项 | 内容 |
| --- | --- |
| 代码范围 | server/services/ai/skills/company{ExcelAnalysis,DocumentParse,InspectionAnalysis,ReportGenerate,KnowledgeAnswer}.js、server/services/ai/aiPromptRegistry.js、server/controllers/companyAiController.js、server/routes/company-ai.js、server/services/ai/aiGateway.js、aiEvidenceService、ai_generation_records |
| 文档依据 | AI-Phase-01-00~01-07 八份报告 + AI-Phase-01-08 任务书 + 集团 AI 案例征集通知 |
| 原则 | **报告结论不能未经验证直接视为代码事实**——所有状态/矩阵/链路结论以本次实际代码核对与接口实测为准 |

### 2.2 环境

| 项 | 值 |
| --- | --- |
| 开发后端 | 5881（PORT=5881 AI_PROVIDER=ollama AI_TIMEOUT_MS=900000 node app.js，本会话内启动） |
| 开发前端 | vite 5889 |
| 生产 | 5876 全程未触碰（含进程、计划任务、.env、生产表写入） |
| 鉴权 | JWT（admin payload，HS256）本地签发，仅打开发端口 |
| 测试留档 | %TEMP%\sk008-tests\（t10_sk002/t10_sk005/t09_sk004/td_sk001/td_sk004 JSON + 脚本）；上阶段留档 %TEMP%\sk004-tests\out\ |

### 2.3 组织范围冻结

场景规划只覆盖：安环管理部、生产管理部、财务部、人力综合部、环卫作业中心、市政园林作业中心。不扩展为集团/区域/其他公司 AI 平台。

### 2.4 严禁开发清单遵守情况

任务书 §四全部禁项（新 Skill / Agent / 数字员工 / 项目综合画像 / 多 Agent / Orchestrator / AI 自主决策 / 自动处罚 / 自动合规判定 / 自动安全判定 / 大规模 Migration / GR V2 / HSE AI 重构 / WPS 重构 / 登录 JWT 修改 / Vben Core 修改 / 大量新依赖）**全部未触碰**；未来需要的能力一律记 `Future`（§21）。

## 3. 五 Skill 现状

### 3.1 清单与状态（T01/T02，以代码为准）

| Skill | Key | 01-0x 报告声明 | **代码状态（为准）** | manifest 实测 | 代码位置 |
| --- | --- | --- | --- | --- | --- |
| SK-001 Excel数据分析 | company.excel.analysis | Active | **Active** | Active | companyExcelAnalysis.js L55 |
| SK-002 文档解析 | company.document.parse | Active | **Active** | Active | companyDocumentParse.js L70 |
| SK-003 检查数据分析 | company.inspection.analysis | Active（01-06） | **Testing** | Testing | companyInspectionAnalysis.js L56 |
| SK-004 报告生成 | company.report.generate | Active（01-07） | **Testing** | Testing | companyReportGenerate.js L41 |
| SK-005 企业知识问答 | company.knowledge.answer | Active（01-02） | **Active**（无 SKILL_STATUS 常量） | 无 status 字段 | companyKnowledgeAnswer.js（未定义该常量） |

### 3.2 状态差异记录（C②/C④，本阶段不改）

- **C②（重要）**：01-06/01-07 报告称 SK-003/SK-004 已「Testing 转 Active」，但代码常量仍为 `'Testing'`，GET /api/company/ai/skills manifest 实测同证实。以代码为准；状态转正需代码变更（本阶段严禁），列入下一阶段首要事项（§26）。
- **C④**：SK-005 与其余四 Skill 结构不一致——代码无 SKILL_STATUS 常量、manifest 响应无 status 字段，外部无法从统一接口读到其状态。

## 4. Skill 能力矩阵

实际审计后填写（✓=具备，△=例外/部分，—=不具备）：

| 能力 | SK-001 | SK-002 | SK-003 | SK-004 | SK-005 |
| --- | :-: | :-: | :-: | :-: | :-: |
| Excel/结构化解析 | ✓ | — | — | — | — |
| 文档解析（docx/pdf） | — | ✓ | — | — | — |
| 确定性统计 | ✓ | — | ✓ | —（表格程序组装，新统计回 SK-003） | — |
| 检查数据分析 | — | — | ✓ | — | — |
| 报告生成 | — | — | — | ✓ | — |
| 企业知识问答（RAG） | — | — | — | — | ✓ |
| Evidence | ✓ | ✓ | ✓ | ✓ | △（RAG citations 自映射，不走 aiEvidenceService，C①） |
| Prompt Registry | ✓ | ✓ | ✓ | ✓ | ✓ |
| AI Gateway | ✓ | ✓ | ✓ | ✓ | ✓ |
| Generation Record | ✓ | ✓ | ✓ | ✓ | ✓ |
| 权限（8 角色） | ✓ | ✓ | ✓ | ✓ | ✓ |

## 5. 架构一致性

统一调用链（任务书 §七）：`Business/Agent → Skill → Skill Service → Permission → Evidence/Retrieval → Prompt Registry → AI Gateway → Provider Registry → Model → Structured Output → Generation Record → Human Review`。

逐 Skill 核对**实际代码调用**（非仅看命名）结论：

- SK-001~SK-004：全链一致——控制器解析输入 → Skill 内 resolvePermission → buildEvidence（aiEvidenceService.createEvidence）→ aiPromptRegistry.getActive → aiGateway.generate → 统一 Skill Output → ai_generation_records 落库（success/failed 均落）→ 输出 disclaimer 强调人工审核；
- SK-005：链路一致，唯二例外——Retrieval 环节为内部 RAG 检索（知识库），Evidence 环节不走 aiEvidenceService 而以 citations 自映射输出（C①，01-01 已裁定 citation_id 别名属 B 类可接受，但与「统一 Evidence」目标存在结构差异，需未来统一）。

**结论：五 Skill 真正构成统一能力体系，2 处结构性例外均已有裁定记录、非阻断。**

## 6. Prompt Registry（T03）

| key | version | active | 获取方式 | Controller 硬编码 | 注册位置 |
| --- | --- | --- | --- | --- | --- |
| company.excel.analysis | v1.0.0 | ✓ | aiPromptRegistry.getActive | 否 | aiPromptRegistry.js L112 |
| company.document.parse | v1.0.0 | ✓ | aiPromptRegistry.getActive | 否 | aiPromptRegistry.js L142 |
| company.inspection.analysis | v1.0.0 | ✓ | aiPromptRegistry.getActive | 否 | aiPromptRegistry.js L176 |
| company.report.generate | v1.0.0 | ✓ | aiPromptRegistry.getActive | 否 | aiPromptRegistry.js L213 |
| company.knowledge.answer | v1.0.0 | ✓ | aiPromptRegistry.getActive | 否 | aiPromptRegistry.js L254 |

5/5 通过：key 齐全、版本信息存在、active 可用、无 Controller 硬编码。

## 7. Evidence（T05）

- SK-001~SK-004 均 `aiEvidenceService.createEvidence` 同源落库，无 Skill 私有 Evidence 系统；
- SK-005 例外（C①）：不 require aiEvidenceService，RAG 检索结果以 citations 自映射输出（citation_id 别名已由 01-01 裁定为 B 类）。统一 Evidence 目标下该结构差异记录在案，本阶段不改；
- 结论：**PASS（SK-005 例外记录在案）**。

## 8. Generation Record（T06）

- 五 Skill 的 success/failed 调用均落 `ai_generation_records`，含 type/sub_type/provider/model/duration/trace；
- 本阶段新增实测记录：**169、170（组合 C）、171（组合 B）、172、173（组合 D）**；复用既有留档：130→131→132（组合 A，01-07）、141/143（组合 E，p6v6）；
- **R2（已冻结）**：GR 缺 skill_id/version 列——本阶段**只审计不 Migration**（C③）；跨 Skill 区分目前依赖 sub_type 字段，功能可用但溯源粒度不足。

## 9. 权限（T07）

- 五 Skill 路由统一 `JWT + SKILL_USER + resolvePermission`（routes/company-ai.js L70-86）；
- SKILL_ALLOWED_ROLES 五文件**逐字一致**：`system_admin / admin / safety_manager / hse_manager / manager / township_manager / viewer / grid_inspector`（8 角色，allowlist fail-closed）；
- 未授权（无 JWT）= 401；8 角色外角色 = 403；角色差异仅体现在 permission_model 分档，不存在某 Skill 私有角色集；
- AI 不能绕过业务权限：Skill 只分析请求方提交的数据，不改变业务数据权限模型（身份链 req.user.id → users.employee_id → employee.id 全程未触碰）。
- 结论：**PASS**。

## 10. Provider（T04）

- skills 目录**零** provider 直连、零 fetch/SDK 直连（Ollama/Grok/DeepSeek/OpenAI 均不可从 Skill 层触达）；
- 五 Skill 统一经 `aiGateway.generate`，`provider=null` 透传统一 Provider Policy；
- 运行态交叉证实（T15）：activeProvider=ollama，grok NOT_CONFIGURED 与 R1 一致。

## 11. Skill 组合验证（T08~T10，A~E 全闭环）

组合验证只验证「Skill A 输出 → Skill B 输入」能否可靠衔接（§十五），**不建设 Orchestrator/Agent Runtime**。

| 组合 | 链路 | 验证方式 | record | 结果 | 衔接发现 |
| --- | --- | --- | --- | --- | --- |
| A | SK-001 → SK-003 → SK-004 | 复用 01-07 T05 留档 | 130→131→132 | 全链 AI，consistency=pass | SK-001 输出 sample_rows 仅 3 条（dataset 172 行），全量行需旁路取数后回填 |
| B | SK-002 → SK-004 | **本阶段补测** | 171 | PASS：126.6s，ai_called=true，consistency=pass，facts_used=6/6，4 章节+1 表，warnings=[] | 输入=SK-002 document 结构+facts 统计（9 标题/102 段/2 表/4267 字符）。**发现留档缺口**：01-07 的 T06 留档实为空数据安全返回（ai_called=false、4 章节×24 字安全文案、1ms），完整 AI 生成本阶段首次补齐 |
| C | SK-002 → SK-005 | **本阶段首测** | 169→170 | PASS：SK-002 解析真实制度 docx 235s（9 标题/102 段/2 表，与 01-05 REAL-1 一致可复现）→ 标题构造 question（≤1000 字）→ SK-005 79.6s，confidence=low，evidence=5，**诚实拒答**「知识资料未包含该制度内容」 | 松耦合（解析辅助提问）成立，防幻觉边界正确；强衔接需知识库导入链（Future/C 类） |
| D | SK-001 → SK-004 | **本阶段实测** | 172→173 | PASS：SK-001 真实司机违章台账 191 行/7 列/3 组（174.1s）→ result 直作 analysis → SK-004 51.3s，ai_called=true，consistency=pass | **facts_used=1 偏低**（C⑤）：SK-001 result 嵌套统计进 SK-004 factIndex 提取弱，报告章节 22~37 字符单薄——衔接可行但事实利用率待增强 |
| E | SK-003 → SK-004 | 复用 p6v6 留档 | 141/143 | PASS：9 月 1504 条真实检查数据，20/20 断言，consistency=pass | 全绿，生产可用度最高 |

**结论：五组合全部闭环，无 D 类阻断。**

### 11.1 统一接口差异分类（§八，A/B/C/D）

| 类 | 项 | 处置 |
| --- | --- | --- |
| A 兼容 | 传输方式差异（multipart：SK-001/002；JSON：SK-003/004/005——按能力类型合理）、8 角色权限、统一错误信封、GR 统一表、maxTokens 差异（1024/1500/1500/1500/2600 按能力校准） | 无需处理 |
| B 可接受历史差异 | SK-005 citation_id 别名（01-01 裁定）、SK-004 顶层 report 字段（result 变体）、SK-005 无数字一致性检查（RAG 拒答机制替代） | 保留 |
| C 需未来统一 | ①SK-005 不走 aiEvidenceService；②SK-003/004 状态 Testing vs 文档 Active；③R2 GR 缺 skill_id/version 列；④SK-005 manifest 缺 status 字段；⑤SK-001→SK-004 factIndex 对嵌套统计提取弱（组合 D 发现） | **记录不改**，列 §21 Deferred |
| D 阻断 | **无** | — |

## 12. 真实业务验证（T11~T14）

### 12.1 实测通过项

| 测试 | 内容 | 证据 |
| --- | --- | --- |
| T11 真实检查数据 | grid_inspection_records 当日核数 **3228 行**，与既有报告口径一致 | 只读 SELECT（允许范围） |
| T12 真实 Excel | 真实司机违章台账 191 行/7 列/3 组 → SK-001（174.1s，record 172，组合 D 输入） | td_sk001 留档 |
| T13 真实文档 | 真实制度 docx（9 标题/102 段/2 表/4267 字符）→ SK-002（235s，record 169；与 01-05 REAL-1 结果一致可复现） | t10_sk002 留档 |
| T14 报告生成 | 组合 B（record 171，制度摘要报告）+ 组合 D（record 173，违章分析报告）+ 组合 E（p6v6 record 141/143，9 月检查月报 20/20） | 三链路三份报告 |

### 12.2 六部门 Data Gap（按 355 表中业务相关 133 的有表清单证据盘点）

| 部门 | 已有结构化数据（实测） | Data Gap |
| --- | --- | --- |
| 安环 | violation_records 2506 行、driver_violation / driver_three_violation / driver_assessment、assessment / hse_assessment_* 考核体系、hazard_record / hazards、inspection_* 检查计划、grid_inspection_records 3228 行 | 事故/应急类结构化数据薄 |
| 生产 | —（hse_assessment_* 为 HSE 考核口径，非生产专项） | 项目/作业/投诉/生产考核**全无专表** |
| 财务 | hse_safety_budget（安全预算专项，非经营财务） | 收入/成本/应收/回款/毛利/项目经营**全无**（8 场景） |
| 环卫 | vehicles、vehicle_check_record、vehicle_inspection_records、vehicle_insurances（车辆链有数据） | 收运/中转站/作业质量/投诉**无表** |
| 市政园林 | — | 绿化/公园/设施/工单**全无** |
| 人综 | employee 3485 行、meeting_records、training_records（仅 19 行） | 考勤表无；培训数据量少 |

无表场景一律记录 Data Gap，未编造任何测试数据冒充真实业务（§十六）。

## 13. 六部门 AI 场景池（§十八全量评估）

| 部门 | 场景 | 评估结论 |
| --- | --- | --- |
| 安环管理部 | 三违分析 | ✓ 数据强（2506 行），SK-003 字段映射可覆盖 |
| | 隐患分析 | ✓ hazard_record/hazards 有数据 |
| | 检查分析 | ✓ 3228 行+inspection_*，组合 E 链路 |
| | 整改闭环分析 | ✓ 隐患+检查数据可支撑 |
| | HSE 月报 | ✓ =组合 E 月度形态 |
| | 事故材料 | △ 结构化数据薄 |
| | 应急预案 | △ 文档型，SK-002 可解析、素材未沉淀 |
| | 培训分析 | △ 培训域数据量少 |
| | 制度问答 | ✓（前提：正式制度入库知识库） |
| 生产管理部 | 生产日报/月报、项目运营分析、项目异常分析、生产考核、投诉分析、人员效率、车辆运行 | **Data Gap**：项目/作业/投诉无专表；暂缓 |
| 财务部 | 收入/成本/毛利/应收/回款/预算/异常费用/项目经营 | **Data Gap**（数据基础仅 5 分）；SK-001 上传模式可覆盖「上传 Excel 即分析」——记第二批/储备；财务 AI 不得自动做财务最终决策 |
| 人力综合部 | 人员结构分析 | ✓ employee 3485 行 |
| | 流失分析 | △ 需离职口径字段确认 |
| | 考勤分析 | ✗ 无考勤表 |
| | 培训分析 | △ training_records 仅 19 行 |
| | 会议纪要 | ✓ SK-002 + meeting_records |
| | 招聘材料/人员配置/督办事项/公文材料/领导材料/月报 | △ 材料模板未沉淀，SK-002+SK-004 技术可行 |
| 环卫作业中心 | 车辆分析 | ✓ 车辆 4 表有数据（结构需现场验证） |
| | 作业数据/作业质量/收运/中转站/投诉 | ✗ 无表 |
| | 人员分析 | △ employee+employee_assignment |
| | 项目月报 | △ 依赖多源，暂缓 |
| 市政园林作业中心 | 绿化养护/公园巡查/市政设施巡查/工单/维修效率/质量分析/项目月报 | **Data Gap 全无**；植物问题图片识别=图片 AI，Future |

## 14. 场景评分（§十九模型 + §二十规则）

评分模型：高频 15 / 人工耗时 15 / 数据基础 15 / 标准化 15 / AI 可行性 15 / 效率可量化 10 / 跨部门复用 10 / 跨项目复用 5 = 100。规则：80~100 立即实施；65~79 第二批；50~64 储备；<50 暂缓。

> **声明（§三十六）**：人工耗时为业务评估档位，**精确基线待实测**；下表评分基于数据基础与验证证据，禁止凭感觉打分——每项理由均锚定 §11/§12 实测记录。

| # | 场景 | 高频 | 耗时 | 数据 | 标准化 | 可行 | 量化 | 跨部门 | 跨项目 | 总分 | 分类 |
| - | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| ① | 检查巡查智能分析与报告生成 | 14 | 12 | 15 | 13 | 14 | 8 | 8 | 4 | **88** | A |
| ② | Excel 台账数据分析（通用） | 12 | 12 | 14 | 14 | 15 | 8 | 8 | 2 | **85** | A |
| ③ | 三违/违章数据分析 | 13 | 12 | 15 | 12 | 13 | 7 | 5 | 3 | **80** | A |
| ④ | 制度/文档解析 | 11 | 11 | 13 | 13 | 13 | 6 | 5 | 3 | **75** | B |
| ⑤ | 企业制度知识问答 | 11 | 10 | 9 | 12 | 13 | 5 | 7 | 3 | **70** | B |
| ⑥ | 人员结构分析 | 10 | 11 | 13 | 11 | 13 | 5 | 4 | 3 | **70** | B |
| ⑦ | HSE 月报 | 与①同链路，合并申报不重复占名额 | | | | | | | | ≈① | A |
| ⑧ | 车辆检查数据分析 | 11 | 10 | 10 | 10 | 12 | 5 | 4 | 3 | **65** | B |
| ⑨ | 会议纪要解析 | 10 | 10 | 11 | 10 | 12 | 5 | 4 | 3 | **65** | B |
| ⑩ | 培训台账分析 | 9 | 8 | 5 | 9 | 12 | 4 | 5 | 3 | **55** | C |

理由要点（关键项）：

- ① 数据基础 15（3228 行+1504 条月度实测 20/20）、AI 可行性 14（组合 E 全绿 record 141/143）；扣分项：报告体例标准化待沉淀（13）；
- ② 数据基础 14（真实台账 191 行实测+SK-001 六部门通用上传模式）、跨部门复用 8；扣分项：各部门 Excel 体例不一（标准化 14 中扣除）、跨项目复用 2（模板差异）；
- ③ 数据基础 15（violation_records 2506 行+driver_* 三表）；跨部门复用 5（违章场景以驾驶员为主）；
- ⑤ 数据基础 9：**知识库未导入正式制度**（组合 C 实测诚实拒答）——为 B 类主因；
- ⑩ 数据基础 5（training_records 仅 19 行）——C 类储备主因；
- 财务 8 场景：数据基础 5 分（仅上传模式），总分落入 50~60 储备档 → 第二批/储备。

## 15. 第一批候选案例（≤10，A/B/C 分类）

**A 类（已具备真实应用条件）3 项、B 类（需补数据/流程）5 项、C 类（未来建设）1 项**；⑦ HSE 月报与①合并。

### CASE-001 检查巡查智能分析与报告生成（A 类，88 分，L4~L5）

| 字段 | 内容 |
| --- | --- |
| CASE-ID / 名称 | CASE-001 / 检查巡查智能分析与报告生成 |
| 所属部门 | 安环管理部（可复制至生产/环卫/市政巡查类数据） |
| 业务场景 | 网格巡查、检查记录的月度/专项分析与报告生成 |
| 以前怎么干 | 人工导出 3228 行巡查数据→人工透视统计→人工撰写月报（人工耗时为业务评估档位，精确基线待实测） |
| 现在怎么干 | grid_inspection_records → SK-003 确定性分析 → SK-004 事实锁定生成报告 → 人工审核（组合 E） |
| AI 类型 | Skill 组合（SK-003+SK-004） |
| 使用 Skill | SK-003、SK-004 |
| 输入 | 检查/巡查数据（月度 1504 条实测；3228 行底座） |
| 输出 | 结构化分析+章节化报告（consistency=pass，9 要素达标） |
| 人工审核点 | 报告 disclaimer+consistency_status+人工复核后发布 |
| 原人工耗时 | 待实测（业务评估档位：数小时/月报） |
| AI 后耗时 | 实测：组合 E 全链分钟级（p6v6 留档 duration） |
| 预计效率提升 | 不写百分比（§三十六）；量化采集计划见 §18 |
| 数据基础 | 强（3228 行+月度 1504 条） |
| 标准化程度 | 高（检查表结构稳定） |
| 复用部门 | 安环/生产/环卫/市政园林（巡查类数据同构，SK-003 字段映射适配） |
| 复用项目 | 各网格/乡镇项目 |
| 评分 | 88（立即实施） |
| 成熟度 | L4~L5（组合 E 全绿+真实月度数据 20/20） |
| 当前证据 | record 141/143（p6v6）、130→131→132（组合 A）、grid_inspection_records 3228 行核数 |
| 缺口 | 人工基线实测；SK-003 状态转正（C②） |
| 下一步 | 真实业务试用 1 个月度周期+人工耗时实测→集团案例申报材料 |

### CASE-002 Excel 台账数据分析通用（A 类，85 分，L4）

| 字段 | 内容 |
| --- | --- |
| CASE-ID / 名称 | CASE-002 / Excel 台账数据分析通用 |
| 所属部门 | 全公司六部门（含财务上传模式） |
| 业务场景 | 各类 Excel 台账上传即分析（违章/考核/培训/车辆/花名册等） |
| 以前怎么干 | 人工 Excel 透视+手工统计（业务评估档位，待实测） |
| 现在怎么干 | 上传 Excel → SK-001 解析+确定性统计 → 结果/报告（可续 SK-004，组合 D） |
| AI 类型 | Skill（SK-001，可续 SK-004） |
| 输入 | xlsx/csv 台账（实测 191 行真实违章台账） |
| 输出 | summary/groups/rankings/trend/extremes/anomalies+（可选）报告 |
| 人工审核点 | 统计结果与原表核对 |
| 原人工耗时 | 待实测 |
| AI 后耗时 | 实测 174.1s（191 行）/组合 D 全链 225.4s |
| 预计效率提升 | 不写百分比 |
| 数据基础 | 强（上传模式不依赖库表） |
| 标准化程度 | 中（体例不一，maxTokens/解析策略已适配） |
| 复用部门 | 六部门全复用（含财务上传模式，记第二批/储备变体） |
| 复用项目 | 全部 |
| 评分 | 85（立即实施） |
| 成熟度 | L4（SK-001 Active+组合 A/D 实测） |
| 当前证据 | record 172/173、01-04 实测、组合 D 链路 |
| 缺口 | 人工基线实测；factIndex 嵌套统计提取弱（C⑤） |
| 下一步 | 选取 2~3 部门真实台账各跑一轮并计时 |

### CASE-003 三违/违章数据分析（A 类，80 分，L4）

| 字段 | 内容 |
| --- | --- |
| CASE-ID / 名称 | CASE-003 / 三违违章数据分析 |
| 所属部门 | 安环管理部 |
| 业务场景 | 三违/驾驶员违章月度分析与考核支撑 |
| 以前怎么干 | 人工按人/按乡镇统计违章（业务评估档位，待实测） |
| 现在怎么干 | violation_records 2506 行 → SK-003 字段映射分析 →（可选）SK-004 报告 |
| AI 类型 | Skill（SK-003） |
| 输入 | violation_records / driver_violation / driver_three_violation |
| 输出 | 分组统计/排名/趋势/异常 |
| 人工审核点 | 归因口径（employee_code 链）人工确认 |
| 原人工耗时 | 待实测 |
| AI 后耗时 | 实测 SK-003 分析分钟级（p6v6） |
| 预计效率提升 | 不写百分比 |
| 数据基础 | 强（2506 行+driver 三表+考核体系） |
| 标准化程度 | 高（既有三违考核口径冻结） |
| 复用部门 | 安环为主；违章字段映射可适配环卫车辆违章 |
| 复用项目 | 各乡镇/网格 |
| 评分 | 80（立即实施） |
| 成熟度 | L4（SK-003 真实数据 20/20） |
| 当前证据 | p6v6、violation_records 2506 行 |
| 缺口 | SK-003 状态转正（C②）；人工基线实测 |
| 下一步 | 与 CASE-001 同周期试用 |

### B/C 类compact卡

| CASE | 场景 | 分/类 | 核心缺口（B 类需补） | 证据 |
| --- | --- | --- | --- | --- |
| CASE-004 | 制度/文档解析 | 75/B | 正式制度文档批量入库与解析模板 | record 169（真实 docx 235s，9 标题/102 段/2 表） |
| CASE-005 | 企业制度知识问答 | 70/B | 知识库导入正式制度（组合 C 实测诚实拒答=库内无该制度） | record 170（confidence=low，evidence=5，拒答正确） |
| CASE-006 | 人员结构分析 | 70/B | 花名册口径确认（在职 1303/1297 差异等既有待办） | employee 3485 行实测 |
| CASE-007 | 车辆检查数据分析 | 65/B | vehicle_check_record 表结构现场验证 | 车辆 4 表有数据 |
| CASE-008 | 会议纪要解析 | 65/B | meeting_records 素材筛选与模板 | 表存在+SK-002 Active |
| CASE-009 | 培训台账分析 | 55/C | training_records 仅 19 行，数据积累后启动 | 有表清单证据 |

（⑦ HSE 月报并入 CASE-001；财务 8 场景=CASE-002 财务上传变体，第二批/储备。）

## 16. Skill / Agent 判断（§二十一）

判定规则：**Skill** 适合标准化/重复性/输入输出明确/规则稳定；**Agent** 适合多 Skill 组合、多步骤执行、有任务目标、需读多个系统、需连续判断下一步、需人工审批。

| 场景 | 判定 | 说明 |
| --- | --- | --- |
| 第一批全部 9 项（CASE-001~009） | **Skill / Skill 组合** | 均为「输入明确→单 Skill 或两 Skill 串联→人工审核」形态 |
| HSE 月报数字员工 | **Agent 型**（Future） | 取数→检查→分析异常→生成报告→送审多步闭环，需多系统读取+审批链；本阶段只判定不开发 |
| 触发 Agent 启动条件 | — | ①至少 2 个部门真实跑通并量化收益；②出现稳定的多 Skill 固定编排需求；③人工审核点标准化后。满足前不建 Agent Runtime |

## 17. 集团案例匹配（§二十四 5 候选 × §二十五 L0~L6）

| 候选 | 方向 | 成熟度 | 依据 |
| --- | --- | :-: | --- |
| 候选1 | 检查巡查智能分析与报告生成 | **L4~L5** | 组合 E 全绿（record 141/143）+ 3228 行底座 + 组合 A 留档；可跨部门复制巡查类数据 |
| 候选2 | Excel 经营数据智能分析 | **L4** | SK-001 Active+组合 A/D 实测；经营口径表缺失走上传模式 |
| 候选3 | 企业制度知识 AI 助手 | **L2~L3** | 组合 C 实测（record 169/170）：技术链通、防幻觉正确，但正式制度未入库=小范围试用档 |
| 候选4 | 多源业务材料自动汇总 | **L3~L4** | SK-001/SK-002 各自 Active、SK-004 组合 B/D 实测通过；缺统一多源入口与材料模板 |
| 候选5 | 项目月报自动生成 | **L0~L1（Future）** | §二十四警示「不能因为概念漂亮就直接判定成熟」——生产/项目/经营数据 **Data Gap 全无**，数据前提不成立 |

**集团精品案例首选：候选 1**（唯一同时具备全绿组合链路+真实月度数据+跨部门复制路径的候选）。

## 18. 效率量化方法（§二十六 + §三十六）

七项指标（原人工耗时/AI 耗时/节省时间/效率提升/人工减少/错误减少/报告周期缩短）的**采集口径**：

| 指标 | 口径 | 当前状态 |
| --- | --- | --- |
| AI 耗时 | record duration_ms 实测 | **已有真实值**：SK-001 174.1s（191 行）、SK-002 235s（制度 docx）、SK-003 月度分析分钟级（p6v6）、SK-004 126.6s（组合 B）/51.3s（组合 D）、SK-005 79.6s；组合 C 全链 314.6s、组合 D 全链 225.4s |
| 原人工耗时 | 同口径任务秒表实测（同一数据集、同一人、同一周期） | **待实测**（业务评估档位仅供排序，不进量化结论） |
| 节省时间/效率提升 | 原人工 − AI − 人工审核 | **不写百分比**，待两者基线齐备后计算 |
| 错误减少 | consistency 拦截次数+人工复核修改数 | 机制在（四元组拦截实证于 01-07 v6），计数待真实周期 |
| 报告周期缩短 | 报告提交时间点对比 | 待真实月度周期 |

示例数字（任务书 §二十六的 150 分钟→40 分钟）**仅为格式示例，本报告未将其当作真实成绩**。

## 19. 证据链（§二十七）

集团案例 PPT 九环节规划与现状：

| 环节 | 现状 |
| --- | --- |
| 案例名称 | ✓ CASE-001~009 |
| 原流程截图 | ✗ 待业务试用期采集 |
| AI 流程截图 | △ 页面可复现（四区块 UI E2E 已证），正式截图待采集 |
| 输入数据 | ✓ 真实台账 191 行/制度 docx/9 月 1504 条留档 |
| 输出结果 | ✓ record 130~173 JSON 留档（%TEMP%\sk008-tests\ 与 %TEMP%\sk004-tests\out\） |
| 人工审核 | ✓ 机制在（consistency_status+disclaimer+HSE AI 人工审核闭环先例 AI-11） |
| 实际耗时 | ✓ AI 侧实测；人工侧待实测 |
| 效率对比 | ✗ 待双基线 |
| 用户评价 | ✗ 待业务部门试用反馈 |

## 20. AI 能力地图（§三十三）

```text
                 公司AI应用层
                       │
       ┌───────────────┼───────────────┐
       │               │               │
     安环             生产            财务
       │               │               │
       ├───────────────┼───────────────┤
       │               │               │
      人综            环卫           市政园林
                       │
               公司通用Skill层
                       │
       ┌──────┬──────┬──────┬──────┬──────┐
       │      │      │      │      │      │
     SK001  SK002  SK003  SK004  SK005
       │      │      │      │      │      │
       └──────┴──────┴──────┴──────┴──────┘
                       │
                AI基础能力层
                       │
       Permission / Evidence / Prompt
                       │
                    Gateway
                       │
                  Provider / Model
```

当前实态：安环/人综/环卫（车辆）应用层已可点亮（数据在位）；生产/财务/市政园林受 Data Gap 限制，仅财务可走 SK-001 上传模式；基础能力层五层全部在位且统一（§5~§10）。

## 21. Deferred（Future 清单）

| 项 | 来源 | 说明 |
| --- | --- | --- |
| SK-003/SK-004 状态转正（Testing→Active） | C② | 需代码变更+转正验收清单，本阶段禁改；**下一阶段首要事项** |
| SK-005 Evidence 统一改造 | C① | 并入 aiEvidenceService |
| SK-005 manifest 补 status 字段 | C④ | 与其余四 Skill 结构对齐 |
| GR R2：skill_id/version 列 | C③ | 需 Migration，冻结技术债 |
| SK-001→SK-004 factIndex 嵌套统计提取增强 | C⑤ | 组合 D facts_used=1 根因 |
| 知识库导入链（SK-002→SK-005 强衔接） | 组合 C | 制度入库后 CASE-005 升 A 类 |
| Skill Orchestrator / Agent Runtime | §十五/§二十一 | 组合验证已证手工衔接可行；待 Agent 启动条件满足 |
| 月报数字员工（Agent 型） | §十六判定 | Future |
| 图片 AI（植物识别等） | §十八 | Future |
| Word/PDF/PPT 复杂排版 | 01-07 §2.2 | 内容模型与文件格式解耦已冻结 |
| GR V2、HSE AI 重构、R1~R5 治理 | 历史冻结 | 非阻断技术债 |

## 22. 当前不做事项（§三十四，含理由）

| 不做 | 理由 |
| --- | --- |
| 暂不做 Agent | 第一批 Skill 场景尚未真实跑通与量化（§四十三禁止「先 Agent 后找业务」反向路径） |
| 暂不做 Skill Orchestrator | 组合 A~E 手工衔接已验证可行，编排层无当前刚需 |
| 暂不做项目综合画像 | 依赖生产/项目数据，Data Gap 全无 |
| 暂不做 AI 数字员工 | Agent 型且需多系统读取+审批链，前提均不具备 |
| 暂不做图片 AI | 市政园林等场景图像数据与标注不具备 |
| 暂不做 Word/PDF/PPT 复杂排版 | SK-004 内容模型与文件格式解耦冻结，页面预览+可复制满足当前需求 |
| 暂不做 Generation Record V2 | R2 冻结，本阶段只审不改 |
| 暂不做 HSE AI 重构 | HSE AI v2 独立体系运行正常（T15 PASS），两体系差异记录即可 |
| 暂不治理 R1~R5 | 历史冻结技术债，均非阻断 |

## 23. 风险

| # | 风险 | 等级 | 处置 |
| --- | --- | --- | --- |
| 1 | SK-003/004 状态差异（代码 Testing vs 文档 Active）：若直接对外申报「五个 Active」与代码不符 | 高 | 状态转正列下一阶段首要事项；申报材料按代码现状表述 |
| 2 | 组合 D 事实利用率低（facts_used=1，章节 22~37 字符单薄） | 中 | C⑤ 增强 factIndex；试用期观察 |
| 3 | 「留档≠实测」：01-07 T06 留档实为空数据安全返回，完整 AI 生成漏测 | 中 | 本阶段已补（record 171）；后续阶段交付前复核测试资产 |
| 4 | SK-005 知识库缺口：正式制度未入库，问答场景无法生产化 | 中 | 知识库导入链列入下一阶段评估 |
| 5 | Data Gap：生产/财务/市政园林场景暂无数据基础 | 中 | 场景池已标注；不强行启动 |
| 6 | 效率量化无人工基线：全部场景人工耗时为业务评估档位 | 高（对申报） | 集团申报前必须完成双基线实测 |
| 7 | HSE v2 recordSaved=false 与 company Skill recordSaved=true 两体系差异 | 低 | 既有设计，记录在案 |
| 8 | 工作区 108 文件未提交改动（+8960/−6482，最近提交 51752a9 CF-WPS-85）为既有改动，非本阶段产生 | 中 | 建议人工分批提交，避免与本阶段后续变更混淆 |

## 24. T01~T16 测试（§三十七）

| # | 测试 | 结果 | 证据 |
| --- | --- | :-: | --- |
| T01 | 五 Skill 清单 | PASS | 5 文件齐（skills/company*.js） |
| T02 | 五 Skill 状态 | PASS（差异记录） | 代码常量核对+manifest 实测：SK-001/002/005 Active、SK-003/004 Testing（C②/C④） |
| T03 | Prompt Registry | PASS | 5/5 v1.0.0，aiPromptRegistry.js L112/142/176/213/254 |
| T04 | AI Gateway | PASS | 5/5 aiGateway.generate，provider=null，零直连 |
| T05 | Evidence | PASS（SK-005 例外 C①） | SK-001~004 aiEvidenceService 同源 |
| T06 | Generation Record | PASS（R2 只审 C③） | success/failed 落库；本阶段新增 record 169~173 |
| T07 | Permission | PASS | JWT+SKILL_USER+resolvePermission，8 角色逐字一致 fail-closed |
| T08 | SK-001→SK-003→SK-004 | PASS | 留档 record 130→131→132，consistency=pass |
| T09 | SK-002→SK-004 | PASS | record 171（本阶段补测，126.6s，facts_used=6/6） |
| T10 | SK-002→SK-005 | PASS | record 169→170（诚实拒答，防幻觉正确） |
| T11 | 真实检查数据 | PASS | grid_inspection_records 3228 行核数一致 |
| T12 | 真实 Excel | PASS | 191 行真实违章台账，record 172（174.1s） |
| T13 | 真实文档 | PASS | 真实制度 docx，record 169（235s，与 01-05 可复现） |
| T14 | 报告生成 | PASS | 组合 B/D/E 三链路报告（record 171/173/141+143） |
| T15 | HSE AI 回归 | PASS | /health 200 activeProvider=ollama；/providers grok NOT_CONFIGURED 与 R1 一致；/models；/generate「正常」957ms traceId 正常（recordSaved=false 为 v2 既有设计） |
| T16 | WPS 回归 | **PASS / zero change** | git 全量改动 108 文件（+8960/−6482）均为既有未提交工作区改动（非本阶段产生），其中**零 WPS 文件**；WPS OAuth/Worker/同步/grid resolver/grid_inspection_records/grid_record_sync_map 零触碰 |

测试资产留档：`%TEMP%\sk008-tests\`（本阶段）+ `%TEMP%\sk004-tests\out\`（复用）。

## 25. 最终结论（§四十一格式）

```text
AI-Phase-01-08：PASS*

（T01~T16 全部完成、组合 A~E 全闭环、六部门场景池与评分完成、集团 5 候选 L0~L6 判定完成；
  记 PASS* 而非 PASS 的原因：5 项 C 类差异记录在案——SK-003/004 状态 Testing vs 文档 Active（C②）、
  SK-005 Evidence 例外（C①）、GR R2 缺列（C③）、SK-005 manifest 缺 status（C④）、组合 D 事实利用率低（C⑤）。
  均非阻断、按任务书记录不改；不强行排名依据不足的案例。）

五个Skill（以代码为准，2026-10-14）：

SK-001 Active
SK-002 Active
SK-003 Testing（文档写 Active，差异 C②）
SK-004 Testing（文档写 Active，差异 C②）
SK-005 Active（manifest 缺 status 字段，差异 C④）

第一优先级案例：
CASE-001 检查巡查智能分析与报告生成（88 分，A 类，L4~L5，集团候选 1）

第二优先级：
CASE-002 Excel 台账数据分析通用（85 分，A 类，L4，集团候选 2）

第三优先级：
CASE-003 三违/违章数据分析（80 分，A 类，L4）
```

## 26. 下一阶段建议（§四十二：本阶段到此严格停止，是否进入 AI-Phase-02 由人工根据本报告决定）

1. **SK-003/SK-004 状态转正**（Testing→Active）：补转正验收清单→代码状态变更→manifest 复核——需用户授权的独立代码变更；
2. **第一批 A 类 3 案例真实业务试用**：各跑 1 个真实月度周期，同步完成人工基线秒表实测（效率量化前提，§18/§19 缺口）；
3. **知识库导入链评估**：正式制度批量入库→CASE-005 升 A 类→组合 C 强衔接；
4. **C 类差异治理排期**：SK-005 Evidence 统一（C①）、manifest status（C④）、factIndex 嵌套统计增强（C⑤）、GR R2 列（C③，需 Migration）；
5. **集团案例申报材料准备**：以 CASE-001 为主线，按 §19 证据链九环节补齐截图与用户评价；
6. **工作区治理**：108 文件既有改动建议人工分批提交（风险 8）。

---

**本阶段结束。审计+组合验证+真实业务验证+场景评分+集团案例规划+最终报告已全部完成，严格停止，不进入下一阶段开发。**
