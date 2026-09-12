-- ============================================================
-- Auth 认证模块数据库 Schema
-- 创建用户表、Token 黑名单表、登录失败记录表
-- ============================================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    real_name VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    department VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    avatar TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS '系统用户表';
COMMENT ON COLUMN users.role IS '角色：admin / manager / viewer';

-- 2. Token 黑名单表（用于登出和改密场景）
CREATE TABLE IF NOT EXISTS token_blacklist (
    id SERIAL PRIMARY KEY,
    token_jti VARCHAR(255) NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE token_blacklist IS 'JWT Token 黑名单（被撤销的 Token）';

-- 3. 登录失败记录表（用于锁定）
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    success BOOLEAN NOT NULL DEFAULT FALSE,
    attempt_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE login_attempts IS '登录失败尝试记录（用于账户锁定）';

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(token_jti);
CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, attempt_time);

-- 5. 初始化默认管理员账号
-- 密码：admin123，使用 bcrypt 哈希（cost=10）
-- 注意：生产环境首次部署后应立即修改默认密码
INSERT INTO users (username, password_hash, real_name, role, department, is_active)
VALUES (
    'admin',
    '$2b$10$iiRdJFl7xIHAH7Bumv/D1OtcwBj1rBWmd15ba60smBGj5L5twMnoK',
    '系统管理员',
    'admin',
    '安全管理部门',
    TRUE
)
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    real_name = EXCLUDED.real_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- 验证
SELECT '用户表创建完成，管理员账号已初始化' AS status;
