# Changelog — 宁津环卫 HSE 安全管理系统

所有重要变更都会记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [3.0.0] — 2026-07-10 — P3 生产就绪版

> 🚀 **生产级版本**，高级工作流、测试体系、CI/CD、性能优化、多租户支持全面就绪

### ✨ 新增

**高级工作流引擎**
- 可视化流程设计器（基于 LogicFlow），支持 6 种节点类型拖拽配置
- 条件分支（边表达式 + formData 上下文动态计算）
- 并行审批（会签模式，全部通过后推进）
- 动态审批人（5 种模式：指定用户 / 角色 / 部门 / 发起人 / 动态字段）
- 流程图可视化展示（详情页高亮当前节点 + 已完成节点）
- 流程定义管理：新建、编辑、复制、启用/停用、删除

**通知系统**
- 站内消息通知（数据库持久化 + WebSocket 实时推送）
- 通知 API：列表、未读数、标记已读、全部已读、删除
- 工作流任务创建时自动通知

**测试体系**
- 前端 Vitest + @vue/test-utils + jsdom，26 个测试用例
- 后端 Jest + supertest，127+ 测试用例
- 核心模块覆盖率：前端 ~70%，后端 ~65%
- 完整测试脚本：`test:unit` / `test:server` / `test:all` / `test:coverage`

**CI/CD 流水线**
- GitHub Actions 完整流水线（ci-cd.yml）
- 多环境支持：development / staging / production
- 7 个 Job：前端 Lint / 前端测试 / 后端测试 / 前端构建 / Docker 构建 / 部署 / 总结
- Docker 镜像构建 + 推送 + 缓存
- SSH 部署到服务器
- 部署通知与健康检查

**多租户支持（可选）**
- tenant_id 字段 + 租户表
- 可配置开关（MULTI_TENANT_ENABLED），单租户模式无缝运行
- 租户中间件 + 工具函数
- 默认租户 ID = 1，向后兼容

**性能优化**
- Vite 构建优化：Terser 压缩、移除 console/debugger
- 代码分割优化：新增 logicflow、sentry 独立 chunk
- 数据库索引优化脚本（40+ 索引建议）
- 高频查询复合索引（告警、审计、工作流、通知）

### 📦 优化

- Vite 构建配置增强，chunk 拆分更合理
- 生产环境移除 console 和 debugger
- 数据库查询性能提升建议
- Sentry 生产环境配置完善

### 🐛 修复

- Sentry.ts 函数定义语法错误
- roles/menus/workflow 路由中 verifyToken 导入不一致
- validate 中间件异步测试问题
- 工作流引擎节点推进逻辑优化

---

## [2.0.0] — 2026-07-07 — P2 功能完善版

### ✨ 新增

- **RBAC 权限系统**：角色管理、菜单管理、动态路由、按钮级权限
- **实时告警中心**：告警 CRUD、WebSocket 实时推送、告警状态流转
- **工作流审批**：流程定义、发起、审批、驳回、历史记录
- **审计日志**：用户操作全记录、查询、导出
- **个人中心**：用户资料修改、密码修改
- **错误监控**：Sentry 生产环境集成
- **Docker 部署**：docker-compose + Nginx + 一键部署

### 📦 技术栈

- 前端：Vue 3 + TypeScript + Pinia + Element Plus + TanStack Query
- 后端：Express + PostgreSQL + Zod 校验 + JWT
- 实时通信：WebSocket
- 部署：Docker + Nginx

---

## [1.0.0] — 2026-06-20 — P0/P1 基础版

### ✨ 新增

- 用户认证（登录、注册、JWT）
- Dashboard 概览
- 用户管理
- 基础数据导入
- 核心业务模块：隐患、事故、培训、保险、车辆、设备等
- 响应式布局 + 深色/浅色主题

---

## 版本说明

| 版本类型 | 说明 |
|---------|------|
| MAJOR (X.0.0) | 重大架构变更、不可兼容的 API 变更 |
| MINOR (0.X.0) | 新增功能模块、向下兼容的功能增强 |
| PATCH (0.0.X) | Bug 修复、性能优化、小改进 |

## 里程碑规划

- [x] P0：基础架构 + 核心业务模块
- [x] P1：认证授权 + Dashboard + 用户管理
- [x] P2：RBAC + 告警 + 工作流 + 审计日志
- [x] P3：测试体系 + 高级工作流 + CI/CD + 性能优化 + 多租户
