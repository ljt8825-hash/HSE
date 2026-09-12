# PostgreSQL 安全加固指南

| 项目信息       | 内容                                  |
|----------------|---------------------------------------|
| 系统名称       | 宁津环卫 HSE 安全管理系统 v4.1        |
| 文档编号       | HSE-SEC-HARDEN-2026-003               |
| 日期           | 2026-07-11                            |

---

## 1. 认证方式

### 1.1 启用 scram-sha-256

当前状态: 已配置 scram-sha-256（项目符合要求）。

```properties
# postgresql.conf
password_encryption = scram-sha-256
```

> scram-sha-256 是 PostgreSQL 推荐的密码认证方式，相比 md5 更安全。
> 确保所有用户密码已使用 scram-sha-256 加密存储。

**验证方法**:
```sql
-- 检查密码加密方式
SELECT name, setting FROM pg_settings WHERE name = 'password_encryption';

-- 检查用户密码哈希前缀
SELECT rolname, rolpassword FROM pg_authid WHERE rolpassword LIKE 'SCRAM-SHA-256%';
```

### 1.2 禁用不安全认证方法

```properties
# pg_hba.conf
# 禁用 trust 和 ident（除非在本地开发环境）
# 以下为生产环境推荐配置

# TYPE  DATABASE  USER  ADDRESS         METHOD
local   all       all                   scram-sha-256
host    all       all   127.0.0.1/32   scram-sha-256
host    all       all   ::1/128         scram-sha-256
host    hse_db    hse_user 10.0.0.0/8  scram-sha-256

# 禁止远程超级用户登录
# host    all       postgres 0.0.0.0/0  reject
```

---

## 2. 连接限制

### 2.1 限制最大连接数

```properties
# postgresql.conf

# 最大连接数（根据服务器配置调整）
max_connections = 100

# 超级用户保留连接
superuser_reserved_connections = 3
```

### 2.2 连接超时

```properties
# postgresql.conf

# 空闲连接超时（毫秒）
idle_session_timeout = 300000      # 5 分钟

# 连接认证超时
authentication_timeout = 60s

# 语句执行超时（防止慢查询攻击）
statement_timeout = 60000           # 60 秒

# 死锁检测超时
deadlock_timeout = 1s
```

### 2.3 连接池限制（应用侧）

```javascript
// server/utils/db.js (应用连接池配置)
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  min: 5,           // 最小连接数
  max: 20,          // 最大连接数
  idleTimeoutMillis: 300000,    // 空闲连接超时 5 分钟
  connectionTimeoutMillis: 5000, // 连接超时 5 秒
});
```

---

## 3. 敏感数据加密

### 3.1 启用 pgcrypto 扩展

```sql
-- 启用 pgcrypto 扩展
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 示例：加密存储身份证号
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  -- 加密存储身份证号
  id_card_encrypted BYTEA,
  phone VARCHAR(20)
);

-- 插入加密数据
INSERT INTO employees (name, id_card_encrypted)
VALUES ('张三', pgp_sym_encrypt('110101199001011234', 'encryption-key'));

-- 查询解密数据
SELECT name, pgp_sym_decrypt(id_card_encrypted, 'encryption-key') AS id_card
FROM employees;

-- 不带密钥的模糊查询（无法直接解密，需要应用层处理）
```

### 3.2 列级加密建议

| 数据类型           | 加密方式             | 说明                          |
|--------------------|---------------------|-------------------------------|
| 身份证号           | pgcrypto pgp_sym     | 必须加密                      |
| 手机号（可选）     | pgcrypto pgp_sym     | 建议加密                      |
| 密码哈希           | bcrypt（应用层）     | 当前已实现                    |
| 地址信息           | 不加密               | 非敏感数据                    |

---

## 4. 审计日志

### 4.1 启用 PostgreSQL 审计日志

```properties
# postgresql.conf

# 记录所有连接尝试
log_connections = on

# 记录断开连接
log_disconnections = on

# 记录认证失败
log_statement = 'ddl'    # 记录 DDL 语句（CREATE, ALTER, DROP）
                          # 'all' 记录所有语句（性能影响大，按需启用）

# 记录持续时间超过阈值的查询
log_min_duration_statement = 1000  # 记录超过 1 秒的查询

# 记录锁等待
log_lock_waits = on
deadlock_timeout = 1s

# 日志格式
log_line_prefix = '%m [%p] %q%u@%d '

# 日志文件
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
log_rotation_size = 100MB
```

### 4.2 使用 pgaudit 扩展（可选）

```properties
# postgresql.conf
shared_preload_libraries = 'pgaudit'

# 审计特定操作
pgaudit.log = 'ddl,write,role'
```

---

## 5. Autovacuum 优化

自动清理对安全和性能都很重要，防止死元组泄露。

```properties
# postgresql.conf

# 启用 autovacuum
autovacuum = on

# 自动清理守护进程数量
autovacuum_max_workers = 3

# 触发自动清理的死元组比例阈值（降低以更频繁清理）
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05

# 防止清理导致的锁争用
autovacuum_vacuum_cost_delay = 2ms
autovacuum_vacuum_cost_limit = 200
```

---

## 6. 网络访问控制

### 6.1 限制监听地址

```properties
# postgresql.conf

# 仅监听本地或特定网段
# listen_addresses = 'localhost'        # 仅本地
listen_addresses = '10.0.0.1'          # 仅特定 IP
# 或者
listen_addresses = '*'                  # 监听所有（配合 pg_hba.conf 限制）
```

### 6.2 防火墙规则

```bash
# 仅允许应用服务器访问 PostgreSQL
# 5432 端口仅对应用服务器网段开放

# iptables
iptables -A INPUT -p tcp -s 10.0.0.0/8 --dport 5432 -j ACCEPT
iptables -A INPUT -p tcp --dport 5432 -j DROP

# 或 firewalld
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port protocol="tcp" port="5432" accept'
firewall-cmd --permanent --remove-port=5432/tcp
firewall-cmd --reload
```

---

## 7. SSL/TLS 配置

### 7.1 启用 SSL 连接

```properties
# postgresql.conf
ssl = on
ssl_cert_file = '/etc/postgresql/server.crt'
ssl_key_file = '/etc/postgresql/server.key'
ssl_ca_file = '/etc/postgresql/ca.crt'

# 要求 SSL 客户端证书验证（可选）
# ssl_prefer_server_ciphers = on
```

```properties
# pg_hba.conf - 要求 SSL
# hostssl all all 0.0.0.0/0 scram-sha-256
# hostnossl all all 0.0.0.0/0 reject
```

### 7.2 应用侧 SSL 连接

```javascript
// 连接字符串添加 SSL 参数
const connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
// 或更严格: sslmode=verify-full
```

---

## 8. 加固检查清单

| 检查项                       | 状态   | 说明                            |
|------------------------------|--------|---------------------------------|
| scram-sha-256 认证           | PASS   | 当前已配置                      |
| 禁用 trust/ident 认证        | CHECK  | 生产环境必须禁用                |
| 最大连接数限制               | CHECK  | max_connections = 100           |
| 连接超时                     | CHECK  | idle_session_timeout 配置       |
| 应用连接池限制               | CHECK  | max: 20                        |
| 敏感数据加密                | TODO   | 评估 pgcrypto 使用             |
| 审计日志                     | CHECK  | log_connections + log_statement |
| Autovacuum                   | CHECK  | 保持默认或优化                  |
| 网络访问控制                | CHECK  | pg_hba.conf + 防火墙            |
| SSL/TLS                     | CHECK  | 生产环境必须启用               |
| 定期备份                     | CHECK  | 确保备份策略有效                |

---

## 9. 定期维护

| 维护项                  | 频率      | 说明                           |
|-------------------------|-----------|-------------------------------|
| 密码轮换               | 每 90 天  | 数据库用户和应用密码          |
| 日志审计               | 每周      | 检查异常登录和查询            |
| 备份验证               | 每月      | 确保备份可恢复                |
| 版本更新               | 按需      | 跟踪 PostgreSQL 安全补丁       |
| 权限审查               | 每季度    | 审查用户权限是否最小化        |

---

*文档日期: 2026-07-11*
