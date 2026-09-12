# 第5步：API 接口测试与数据校验

## 前置条件（第4步完成后）

第1-4步全部完成：数据已迁移、Auth 已对接、后端架构已统一、数据库已加固。系统具备完整的认证链路和真实数据。

## 项目背景

你正在开发**山东省宁津县环卫公司 HSE 安全管理系统**。

**当前测试状态：**
- Node.js 后端有 `jest.config.js` 测试配置，但未见实际测试用例
- 前端重构阶段曾计划使用 Vitest（单元测试）+ Playwright（E2E 测试）
- 当前所有 API 接口缺乏自动化测试，依赖手动验证
- 后端路由缺乏请求参数校验（如必填字段、数据类型、取值范围等）

**后端路由清单（需测试覆盖）：**

| 模块 | 路由文件 | 主要接口 |
|------|---------|---------|
| 车辆 | `routes/vehicles.js` | CRUD + 统计 + 导入导出 |
| 文件 | `routes/files.js` | 上传下载 |
| 文件记录 | `routes/file-records.js` | 文件记录管理 |
| 风险管控 | `routes/risk-control.js` | 风险源管理 |
| 导入 | `routes/import.js` | 数据导入 |
| 总览 | `routes/overview.js` | 首页统计 |
| 规章制度 | `routes/regulations.js` | 制度管理 |
| 培训 | `routes/training.js` | 培训记录 |
| 事故 | `routes/accidents.js` | 事故记录 |
| 隐患 | `routes/hazards.js` | 隐患排查 |
| 应急 | `routes/emergency.js` | 应急演练 |
| 保险 | `routes/insurance.js` | 人员保险 + 车辆保险 |
| 现场管理 | `routes/site-mgmt.js` | 现场作业管理 |
| 目标责任 | `routes/objectives.js` | 目标责任制 |
| 认证 | `routes/auth.js`（第2步新增） | 登录登出改密 |

## 核心问题

15 个路由模块、50+ API 接口没有任何自动化测试。接口缺少参数校验，异常输入可能导致数据库错误或数据不一致。

## 你的任务

### 任务 1：引入请求校验库

为 Node.js 后端添加请求参数校验能力：

**推荐方案：** 使用 `zod` 进行 Schema 校验（轻量、TypeScript 友好、Node.js 原生可用）

```javascript
const { z } = require('zod');

// 示例：登录请求校验
const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(8).max(128)
});

// 示例：创建事故记录校验
const createAccidentSchema = z.object({
  no: z.number().int().positive().optional(),
  accident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  township: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  accident_type: z.string().max(50),
  responsibility: z.string().max(100).optional(),
  level: z.string().max(20).optional(),
  status: z.enum(['处理中', '已结案', '跟踪中']).default('处理中')
});
```

**要求：**
- 为每个 POST/PUT 接口创建对应的 Zod Schema
- 创建统一的校验中间件 `server/middleware/validate.js`
- 校验失败返回 400 错误，包含具体的字段错误信息
- Schema 文件统一放在 `server/schemas/` 目录

### 任务 2：编写 API 集成测试

基于已有的 `jest.config.js`，使用 `supertest` 编写 API 集成测试：

**测试工具链：**
- 测试框架：Jest（已配置）
- HTTP 客户端：`supertest`（需安装）
- 数据库：使用真实数据库（测试前清理，测试后恢复）

**测试结构：**
```
server/
  __tests__/
    setup.js           -- 测试前置（启动应用、创建测试用户、获取 Token）
    teardown.js        -- 测试后置（清理测试数据）
    auth.test.js       -- 认证接口测试
    vehicles.test.js    -- 车辆管理接口测试
    insurance.test.js   -- 保险管理接口测试
    accidents.test.js   -- 事故管理接口测试
    overview.test.js   -- 总览统计接口测试
    ...
```

**每个接口至少覆盖以下场景：**

| 场景 | 预期结果 |
|------|---------|
| 正常请求 | 200 + 正确数据 |
| 缺少必填字段 | 400 + 字段错误信息 |
| 数据类型错误 | 400 + 类型错误信息 |
| 未登录访问 | 401 |
| 普通用户访问管理接口 | 403（如有权限控制） |
| 不存在的资源 | 404 |
| SQL 注入尝试 | 400 或被正确转义 |
| 超长字符串 | 400（如有长度限制） |

### 任务 3：编写关键接口的边界测试

针对以下高风险接口，编写详细的边界测试：

**3.1 登录接口 (`POST /api/auth/login`)**
- 空用户名/密码
- 超长用户名（>50字符）
- SQL 注入字符串（`' OR 1=1 --`）
- 不存在的用户名
- 正确用户名 + 错误密码
- 连续 5 次错误后锁定
- 锁定后正确密码也应被拒绝

**3.2 数据导入接口 (`POST /api/import/*`)**
- 空 Excel 文件
- 列数不匹配的 Excel
- 超大文件（>10MB）
- 非法文件格式（.exe 伪装为 .xlsx）
- 数据类型转换失败（文本 "abc" 写入数字字段）

**3.3 文件上传接口 (`POST /api/files/upload`)**
- 超过 10MB 的文件
- 非允许的文件类型
- 路径遍历攻击（文件名包含 `../`）

### 任务 4：数据一致性验证

编写数据一致性检查脚本，验证前后端数据流：

1. **前后端数据格式一致性**：调用 API 获取数据，验证返回的字段名和类型与前端 TypeScript 类型定义一致
2. **分页数据完整性**：验证分页接口的 total 与实际数据条数一致
3. **统计数据准确性**：对比 API 返回的统计数值与数据库直接查询的结果
4. **级联操作一致性**：删除关联数据后，关联表的数据状态是否正确

### 任务 5：执行测试并记录结果

1. 安装依赖：`npm install supertest zod --save-dev`
2. 运行全部测试：`npm test`
3. 记录通过/失败/跳过的用例数
4. 针对失败的用例分析原因并修复
5. 重复执行直到所有测试通过

## 输出要求

生成一份 Markdown 报告文件 `step5-api-testing-report.md`，保存到 `f:\个人文件\新安全看板\prompts\` 目录，包含以下章节：

1. **校验 Schema 设计** — 各接口的 Zod Schema 汇总、校验规则说明
2. **测试用例设计** — 各模块的测试场景清单、边界条件说明
3. **测试执行结果** — 通过/失败/跳过的用例数、失败用例分析、修复过程
4. **数据一致性报告** — 前后端数据格式对照表、统计数据准确性验证
5. **测试覆盖率评估** — 接口覆盖率、场景覆盖率、未覆盖的接口清单
6. **遗留问题与下一步建议** — 待补充的测试场景、性能测试需求、下一步（生产部署准备）

## 技术约束

- 测试框架：Jest（已配置）
- HTTP 测试库：supertest
- 校验库：zod
- 测试数据库：使用真实的 `safety_dashboard` 数据库（测试前需备份）
- 不得修改业务逻辑代码（仅添加校验中间件和测试用例）
- 测试用例需可重复执行（幂等性）

## 关键文件路径

| 文件 | 路径 |
|------|------|
| 后端入口 | `f:\个人文件\新安全看板\server\app.js` |
| 后端路由目录 | `f:\个人文件\新安全看板\server\routes\` |
| 后端中间件 | `f:\个人文件\新安全看板\server\middleware\` |
| Jest 配置 | `f:\个人文件\新安全看板\server\jest.config.js` |
| 前端类型定义 | `f:\个人文件\新安全看板\安全管理系统\src\types\` |
| 前端 API 层 | `f:\个人文件\新安全看板\安全管理系统\src\api\` |
| 后端 package.json | `f:\个人文件\新安全看板\server\package.json` |
