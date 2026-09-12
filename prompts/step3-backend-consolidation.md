# 第3步：统一后端架构 — 明确技术选型与职责划分

## 前置条件（第2步完成后）

第1步数据迁移已完成，业务表中已有真实数据。第2步 Auth 模块已完成前后端对接，JWT Token 认证链路畅通。

## 项目背景

你正在开发**山东省宁津县环卫公司 HSE 安全管理系统**。

**当前双后端架构问题：**

| 维度 | Node.js 后端 (实际运行) | Python Flask 后端 (代码存在但未启用) |
|------|------------------------|-------------------------------------|
| 入口 | `server/app.js` (JS) / `server/src/app.ts` (TS) | `安全管理系统/backend/app.py` |
| 端口 | 3000 | 5001 |
| 驱动 | `pg` (原生连接池，无 ORM) | `psycopg2-binary` + SQLAlchemy 2.0 |
| 路由数量 | 14 个已注册 | 11 个 Blueprint 已编写 |
| 数据迁移 | 无（依赖内存数据回退模式） | 有完整的迁移脚本（migrate_all_v2.py 等） |
| 启动方式 | `node server/app.js` | 未见启动脚本引用 |
| 状态 | 生产就绪 | 开发辅助/数据处理工具 |

**痛点：**
- 两套后端维护两套模型定义（`server/routes/` 中的 SQL 查询 vs `backend/models/` 中的 ORM 模型）
- Python 模型与 Node.js 路由的表结构可能不一致
- 开发者不清楚该在哪里新增功能
- 部署时需要维护两套运行环境

## 核心问题

双后端并存增加了维护成本和认知负担，需要在架构层面明确技术选型，消除歧义。

## 你的任务

### 任务 1：全面审计两套后端

**Node.js 后端审计：**
- 逐一检查 `server/routes/` 下 14 个路由文件，记录每个路由的 CRUD 操作和 SQL 查询
- 检查 `server/src/app.ts`（TS 版入口）与 `server/app.js`（JS 版入口）的差异
- 评估 TypeScript 编译配置 (`tsconfig.json`) 和构建流程 (`npm run build`)
- 检查测试配置 (`jest.config.js`) 和现有测试用例

**Python Flask 后端审计：**
- 检查 `安全管理系统/backend/app.py` 的 Blueprint 注册列表
- 审计 `backend/models/` 下所有 ORM 模型的字段定义
- 对比 Python ORM 模型与 `sql/unified_schema.sql` 的表结构一致性
- 评估迁移脚本的可用性

### 任务 2：功能覆盖对比

生成一份详细的功能覆盖矩阵：

| 业务模块 | Node.js 路由 | Python Blueprint | 数据模型 | 迁移脚本 | 差异 |
|---------|-------------|-----------------|---------|---------|------|
| 车辆管理 | vehicles.js | ? | vehicle_model.py | migrate_vehicle_data.py | ? |
| 保险管理 | insurance.js | ? | insurance_model.py | migrate_overage_data.py | ? |
| 事故管理 | accidents.js | ? | accident_model.py | migrate_all_v2.py | ? |
| ... | ... | ... | ... | ... | ... |

标注每个模块在两套后端中的覆盖程度，明确哪些功能只有一方实现。

### 任务 3：提出统一方案

基于审计结果，提出推荐的技术选型方案（要求至少分析 3 个方案的利弊）：

**方案 A（推荐）：Node.js 主后端 + Python 数据工具**
- Node.js Express 作为唯一 API 服务器
- Python 保留为数据处理/迁移/ETL 工具链
- 清晰的职责边界：Node.js 负责 API，Python 负责批处理

**方案 B：统一到 Python Flask**
- 将所有 API 迁移到 Flask + SQLAlchemy
- 利用 ORM 的优势减少手写 SQL

**方案 C：微服务拆分**
- Node.js 负责 CRUD API
- Python 负责数据分析/报表/导出等计算密集型任务
- 通过内部 HTTP 或消息队列通信

**分析维度：**
- 团队技术栈匹配度
- 迁移工作量评估
- 运维复杂度
- 性能特征
- 社区生态与长期可维护性

### 任务 4：制定迁移计划

基于选定的方案，输出一份可执行的行动计划：

1. **短期（1-2天）**：清理冗余代码，明确边界
2. **中期（3-5天）**：功能统一到选定后端
3. **长期（持续）**：废弃代码归档，文档更新

包含：
- 需要删除/归档的文件清单
- 需要迁移的功能清单（从 A → B）
- 需要新增的代码清单
- 回归测试范围

### 任务 5：执行初步清理

执行方案中"短期"部分的清理工作：
- 归档不再使用的代码（移入 `.trash/` 或 `legacy/` 目录）
- 更新 `README.md` 中的架构说明
- 统一配置文件中的注释，标注各后端的角色

## 输出要求

生成一份 Markdown 报告文件 `step3-backend-consolidation-report.md`，保存到 `f:\个人文件\新安全看板\prompts\` 目录，包含以下章节：

1. **双后端审计结果** — 两套后端的完整功能清单、代码量统计、依赖对比
2. **功能覆盖矩阵** — 各业务模块在两套后端的覆盖情况
3. **方案对比分析** — 3 个方案的利弊对比表、推荐方案及理由
4. **迁移计划** — 短/中/长期行动计划、工作量估算、风险评估
5. **已执行的清理工作** — 归档的文件、更新的配置、删除的冗余代码
6. **遗留问题与下一步建议** — 需要决策的边界案例、下一步（数据库安全加固）的前置条件

## 技术约束

- 不得破坏现有已正常工作的 Node.js API 路由
- 不得删除迁移脚本（即使选定 Node.js 方案，迁移脚本仍有价值）
- 归档代码需保留可追溯性（在归档目录中添加 README 说明）
- 前端代码不受影响（API 路径保持不变）

## 关键文件路径

| 文件 | 路径 |
|------|------|
| Node.js 主入口 (JS) | `f:\个人文件\新安全看板\server\app.js` |
| Node.js 主入口 (TS) | `f:\个人文件\新安全看板\server\src\app.ts` |
| Node.js 路由目录 | `f:\个人文件\新安全看板\server\routes\` |
| Node.js 配置 | `f:\个人文件\新安全看板\server\config\db.js` |
| Node.js 测试配置 | `f:\个人文件\新安全看板\server\jest.config.js` |
| Python 主入口 | `f:\个人文件\新安全看板\安全管理系统\backend\app.py` |
| Python 配置 | `f:\个人文件\新安全看板\安全管理系统\backend\config.py` |
| Python ORM 模型 | `f:\个人文件\新安全看板\安全管理系统\backend\models\` |
| Python 迁移脚本 | `f:\个人文件\新安全看板\安全管理系统\backend\migrate_all_v2.py` |
| 权威 DDL | `f:\个人文件\新安全看板\sql\unified_schema.sql` |
| 前端 API 层 | `f:\个人文件\新安全看板\安全管理系统\src\api\` |
