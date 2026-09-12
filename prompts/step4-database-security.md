# 第4步：数据库安全加固

## 前置条件（第3步完成后）

第1步数据迁移完成，第2步 Auth 模块对接完成，第3步后端架构已统一（Node.js 作为主后端，Python 作为数据处理工具）。

## 项目背景

你正在开发**山东省宁津县环卫公司 HSE 安全管理系统**。

**当前数据库安全状态：**

| 安全维度 | 当前状态 | 风险等级 |
|---------|---------|---------|
| 数据库密码 | 空密码（trust 认证） | **严重** |
| pg_hba.conf | 可能允许所有本地连接免密 | **严重** |
| SSL 连接 | 未配置 | **高** |
| 密码硬编码 | `create_db.py` 中遗留 `HseAdmin123!` | **中** |
| 库名不一致 | `create_db.py` 用 `hse_db`，其他用 `safety_dashboard` | **低** |
| 数据库用户权限 | postgres 超级用户用于应用连接 | **中** |
| SQL 注入防护 | Node.js 后端使用参数化查询（pg 驱动原生支持） | **低**（已基本防护） |
| 数据库备份 | 未配置自动备份 | **高** |
| 审计日志 | 未开启 | **中** |
| 连接池安全 | max=10，无连接超时限制 | **低** |

## 核心问题

数据库以空密码 + postgres 超级用户运行，任何能访问 5432 端口的人都可以直接连接并拥有完整权限。部署到生产环境前必须加固。

## 你的任务

### 任务 1：检查当前 PostgreSQL 安全配置

连接 PostgreSQL，执行以下诊断查询并记录结果：

```sql
-- 1. 查看 pg_hba.conf 认证配置
SHOW hba_file;
-- 读取文件内容

-- 2. 查看当前用户和权限
SELECT usename, usesuper, usecreatedb, valuntil FROM pg_user;

-- 3. 查看当前数据库连接权限
SELECT datname, datacl FROM pg_database WHERE datname = 'safety_dashboard';

-- 4. 查看 Schema 权限
SELECT nspname, nspacl FROM pg_namespace WHERE nspname = 'public';

-- 5. 查看密码加密设置
SHOW password_encryption;

-- 6. 查看 SSL 配置
SHOW ssl;
```

### 任务 2：制定安全加固方案

基于诊断结果，制定以下加固措施：

**2.1 设置数据库密码**
- 为 postgres 超级用户设置强密码
- 创建专用应用用户 `hse_app`，仅拥有 `safety_dashboard` 的必要权限
- 更新所有 `.env` 配置文件中的密码

**2.2 权限最小化**
```sql
-- 创建应用用户
CREATE USER hse_app WITH PASSWORD '生成的强密码';

-- 授权仅限 safety_dashboard
GRANT CONNECT ON DATABASE safety_dashboard TO hse_app;
GRANT USAGE ON SCHEMA public TO hse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hse_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hse_app;

-- 确保未来新建表也自动授权
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hse_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hse_app;
```

**2.3 pg_hba.conf 加固**
- 本地 peer 认证（仅系统用户 postgres 可免密连接）
- 应用连接改用 scram-sha-256 认证
- 移除或限制远程连接（如不需要）

**2.4 SSL 配置（生产推荐）**
- 评估是否需要 SSL（内网部署可能不需要）
- 如需要，生成自签名证书或申请正式证书

**2.5 清理遗留问题**
- 删除或修复 `create_db.py` 中的硬编码密码 `HseAdmin123!`
- 统一库名引用（全部使用 `safety_dashboard`）

### 任务 3：配置自动备份

设计并实现 PostgreSQL 自动备份方案：

**备份策略：**
- 每日全量备份（凌晨 2:00 执行）
- 保留最近 7 天的备份
- 备份文件压缩存储
- 备份结果通知（日志记录）

**实现方式：**
- 创建 `scripts/backup_pg.sh`（Linux）或 `scripts/backup_pg.ps1`（Windows PowerShell）
- 使用 `pg_dump` 命令
- 配置 Windows 任务计划程序 或 cron 定时执行
- 备份文件存储路径：`f:\个人文件\新安全看板\backups\postgresql\`

### 任务 4：开启审计日志

配置 PostgreSQL 审计日志，记录关键操作：

```postgresql
-- postgresql.conf
log_connections = on
log_disconnections = on
log_duration = on
log_statement = 'ddl'  -- 记录所有 DDL 操作
```

### 任务 5：更新所有配置文件

同步更新以下文件中的数据库连接信息：
- `server/.env` — Node.js 后端环境变量
- `安全管理系统/.env` — 前端环境变量（无数据库配置，但需确认）
- `安全管理系统/backend/config.py` — Python 后端配置
- `.env.docker.example` — Docker 模板

### 任务 6：验证加固结果

1. 使用旧密码尝试连接 → 应失败
2. 使用 hse_app 用户 + 新密码连接 → 应成功
3. hse_app 尝试创建新数据库 → 应失败（权限不足）
4. hse_app 对 safety_dashboard 执行 CRUD → 应成功
5. Node.js 后端 `/api/health` → 应返回数据库连接正常
6. 前端页面加载 → 应正常显示数据

## 输出要求

生成一份 Markdown 报告文件 `step4-database-security-report.md`，保存到 `f:\个人文件\新安全看板\prompts\` 目录，包含以下章节：

1. **安全诊断报告** — 当前配置状态、发现的 vulnerabilities、风险评级
2. **加固方案** — 每项措施的实施步骤、SQL 语句、配置变更
3. **备份方案** — 备份脚本内容、定时任务配置、恢复测试步骤
4. **配置变更清单** — 修改的文件列表、修改前后对比
5. **验证结果** — 每项加固措施的验证通过/失败记录
6. **遗留问题与下一步建议** — SSL 证书管理、密码轮换策略、下一步（API 测试与校验）

## 技术约束

- 数据库：PostgreSQL 17，当前空密码 trust 认证
- 操作系统：Windows（PowerShell 脚本）
- 加固过程不得中断业务（如有正在运行的服务）
- 备份脚本需兼容 Windows 任务计划程序
- 密码不得明文写入代码仓库（仅存在于 .env 文件，.env 应在 .gitignore 中）

## 关键文件路径

| 文件 | 路径 |
|------|------|
| Node.js 数据库配置 | `f:\个人文件\新安全看板\server\config\db.js` |
| Node.js 环境变量 | `f:\个人文件\新安全看板\server\.env` |
| Python 后端配置 | `f:\个人文件\新安全看板\安全管理系统\backend\config.py` |
| Docker 模板 | `f:\个人文件\新安全看板\.env.docker.example` |
| 遗留硬编码密码 | `f:\个人文件\新安全看板\安全管理系统\backend\create_db.py` |
| 权威 DDL | `f:\个人文件\新安全看板\sql\unified_schema.sql` |
| 备份脚本（待创建） | `f:\个人文件\新安全看板\scripts\backup_pg.ps1` |
