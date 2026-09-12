# 第1步：数据迁移 — 填充业务表

## 项目背景

你正在开发**山东省宁津县环卫公司 HSE 安全管理系统**。项目已完成以下工作：
- 前端：Vue 3 + TypeScript + Naive UI + Vite 6（重构完成）
- 后端：Node.js (Express + pg) 运行在 3000 端口；Python Flask (SQLAlchemy + psycopg2) 运行在 5001 端口
- 数据库：PostgreSQL 17，数据库名 `safety_dashboard`，空密码 trust 认证
- 数据库 Schema 已建好（81 张表存在），但**所有业务表均为 0 行**
- Python 迁移脚本 `migrate_all_v2.py` 已编写，支持 6 个模块（事故、规章、培训、隐患、应急、目标、现场管理、风险管控、保险）

## 核心问题

数据库 Schema 已就绪，但业务数据从未实际迁移。系统所有页面将显示空数据，无法进行功能验证。

## 你的任务

### 任务 1：审查现有迁移脚本

阅读并分析以下文件，评估其完整性和正确性：
- `安全管理系统/backend/migrate_all_v2.py` — 主迁移脚本
- `安全管理系统/backend/migrate_all.py` — v1 迁移脚本（对比参考）
- `安全管理系统/backend/migrate_vehicle_data.py` — 车辆数据迁移
- `安全管理系统/backend/migrate_overage_data.py` — 超龄人员迁移
- `sql/unified_schema.sql` — 权威 DDL
- `安全管理系统/backend/check_db.py` — 数据库连接检查

检查要点：
- 迁移脚本引用的 JS 数据文件路径是否正确存在
- 字段映射是否与 `unified_schema.sql` 中的表结构一致
- 是否有数据类型转换问题（日期格式、JSON 解析等）
- 是否有主键冲突或唯一约束冲突的处理逻辑

### 任务 2：验证数据源文件

检查 JS 数据文件是否存在并包含有效数据：
- `安全管理系统/data/` 目录下的 `accident_data.js`、`regulation_data.js` 等文件
- `数据源/` 目录下的 Excel/CSV 原始数据文件
- 按项目约定，在 `数据源/02_保险及人员管理/人员保险` 中选择最新修改的文件

### 任务 3：执行数据迁移

1. 先运行 `check_db.py` 确认数据库连接正常
2. 执行 `migrate_all_v2.py` 进行全量迁移
3. 如果迁移失败，定位错误原因并修复脚本后重试
4. 迁移成功后，逐一查询各业务表的数据行数，确认迁移结果

### 任务 4：数据完整性验证

迁移完成后，执行以下验证：
- 查询 `information_schema.tables` 统计各表行数
- 抽查 2-3 张表的数据内容，确认字段值合理
- 检查外键关联是否完整（如事故-部门、人员-保险等）
- 确认 Node.js 后端 `/api/health` 和 `/api/postgres/status` 接口返回正常

## 输出要求

生成一份 Markdown 报告文件 `step1-data-migration-report.md`，保存到 `f:\个人文件\新安全看板\prompts\` 目录，包含以下章节：

1. **迁移前状态** — 各业务表行数、数据库连接状态
2. **脚本审查结果** — 发现的问题和修复措施
3. **迁移执行记录** — 命令输出、成功/失败详情、修复过程
4. **迁移后验证** — 各表数据行数统计表、抽查数据样例、外键完整性检查结果
5. **遗留问题与下一步建议** — 未迁移的数据、数据质量问题、下一步（Auth 模块对接）的前置条件

## 技术约束

- 数据库：PostgreSQL `safety_dashboard`，空密码
- Python 环境：需要 `psycopg2-binary`、`flask-sqlalchemy` 依赖
- 不得修改 `unified_schema.sql` 的表结构
- 迁移脚本修复后需保持幂等性（可重复执行不报错）

## 关键文件路径

| 文件 | 路径 |
|------|------|
| Node.js 后端入口 | `f:\个人文件\新安全看板\server\app.js` |
| 数据库配置 | `f:\个人文件\新安全看板\server\config\db.js` |
| 环境变量 | `f:\个人文件\新安全看板\server\.env` |
| Python 迁移脚本 v2 | `f:\个人文件\新安全看板\安全管理系统\backend\migrate_all_v2.py` |
| Python 迁移脚本 v1 | `f:\个人文件\新安全看板\安全管理系统\backend\migrate_all.py` |
| 数据库检查 | `f:\个人文件\新安全看板\安全管理系统\backend\check_db.py` |
| 权威 DDL | `f:\个人文件\新安全看板\sql\unified_schema.sql` |
| Python 后端配置 | `f:\个人文件\新安全看板\安全管理系统\backend\config.py` |
| Python 后端模型 | `f:\个人文件\新安全看板\安全管理系统\backend\models/` |
| 保险人员数据源 | `f:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险` |
