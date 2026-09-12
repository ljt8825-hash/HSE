
# 部署 Checklist — 宁津环卫 HSE 安全管理系统

## 生产环境部署前检查清单

### 一、环境准备

- [ ] 服务器操作系统：推荐 Ubuntu 22.04 / CentOS 8+
- [ ] Docker 版本 >= 24.0
- [ ] Docker Compose 版本 >= 2.20
- [ ] 开放端口：80 (HTTP) / 443 (HTTPS)
- [ ] 服务器最低配置：2核4G（推荐4核8G）
- [ ] 磁盘空间 >= 50GB（数据库 + 上传文件）
- [ ] 域名已解析到服务器 IP（生产环境必须）

### 二、环境变量配置

- [ ] 复制 `.env.example` 为 `.env`
- [ ] 修改 `JWT_SECRET` 为 32+ 位强随机密钥
- [ ] 修改数据库密码 `POSTGRES_PASSWORD` / `DB_PASSWORD`
- [ ] 配置 Sentry DSN（可选，生产推荐）
- [ ] 配置 `MULTI_TENANT_ENABLED`（默认 false）
- [ ] 配置时区 `TZ=Asia/Shanghai`
- [ ] 配置 `COMPOSE_PROJECT_NAME`

### 三、数据库初始化

- [ ] 执行数据库迁移脚本（`scripts/init-db.sh`）
- [ ] 验证表结构是否创建成功
- [ ] 执行性能优化索引脚本
- [ ] 确认初始管理员账号可用 (admin / admin123)
- [ ] **修改默认管理员密码**

### 四、Docker 部署

- [ ] `docker compose -f docker-compose.yml -f docker-compose.production.yml config` 检查配置
- [ ] `docker compose pull` 拉取镜像
- [ ] `docker compose up -d` 启动服务
- [ ] `docker compose ps` 检查所有容器状态 healthy
- [ ] `docker compose logs` 检查日志无报错

### 五、功能验证

- [ ] 访问首页正常加载
- [ ] 使用管理员账号登录成功
- [ ] Dashboard 数据正常显示
- [ ] 用户管理功能正常
- [ ] 角色权限功能正常
- [ ] 告警中心 WebSocket 连接正常
- [ ] 工作流功能正常
- [ ] 文件上传下载正常
- [ ] 修改密码功能正常
- [ ] 登出功能正常

### 六、安全加固

- [ ] 配置 HTTPS 证书（Let's Encrypt 或商业证书）
- [ ] 配置 Nginx 安全头（HSTS、CSP 等）
- [ ] 关闭不必要的端口（数据库仅本地访问）
- [ ] 配置服务器防火墙
- [ ] 配置定期数据库备份
- [ ] 配置日志轮转
- [ ] 配置 Sentry 错误监控
- [ ] 移除/禁用测试账号

### 七、备份与运维

- [ ] 数据库自动备份（每日一次，保留7天）
- [ ] 上传文件备份
- [ ] 日志文件轮转
- [ ] 服务器监控（CPU/内存/磁盘）
- [ ] 应用监控（Sentry）
- [ ] 告警通知渠道配置

### 八、上线前最后检查

- [ ] 生产环境无 console.log/debugger
- [ ] 前端资源已压缩
- [ ] 所有密码已修改为强密码
- [ ] .env 文件权限 600
- [ ] 已完成性能测试
- [ ] 已完成安全测试
- [ ] 有回滚方案

---

## 默认账号

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | 超级管理员 | 全系统权限 |
| safety | safety123 | 安全管理员 | 安全管理相关模块 |
| user | user123 | 普通员工 | 基础浏览权限 |

> ⚠️ **生产环境请务必立即修改所有默认账号密码！**

---

## 常用运维命令

```bash
# 启动服务
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d

# 停止服务
docker compose down

# 查看日志
docker compose logs -f app       # 后端日志
docker compose logs -f nginx     # Nginx 日志
docker compose logs -f postgres  # 数据库日志

# 进入容器
docker compose exec app sh       # 后端容器
docker compose exec postgres sh  # 数据库容器

# 数据库备份
docker compose exec postgres pg_dump -U hse_user hse_db > backup_$(date +%Y%m%d).sql

# 数据库恢复
docker compose exec -T postgres psql -U hse_user hse_db < backup_20260710.sql

# 更新镜像
docker compose pull
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d

# 查看资源使用
docker stats
```
