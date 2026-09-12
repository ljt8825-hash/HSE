# HSE 安全管理系统 - 后端服务

> 宁津项目 HSE 安全管理系统 Node.js + MySQL 后端 API 服务

---

## 📂 目录结构

```
server/
├── app.js                # 服务入口（Express 启动、中间件挂载）
├── package.json          # 依赖配置
├── .env                  # 环境变量（⚠️ 请勿提交真实密码到 Git）
├── config/
│   └── db.js            # MySQL 连接池配置
├── controllers/
│   └── vehicles.js      # 车辆保险模块 Controller（CRUD + Excel 导入导出）
├── routes/
│   ├── vehicles.js       # /api/vehicles 路由
│   └── files.js         # /api/files 路由（文件上传/下载/删除）
├── middleware/
│   ├── upload.js        # Multer 上传中间件（类型校验 + 魔术字节校验）
│   ├── response.js       # 统一响应格式 { code, success, message, data }
│   └── error.js         # 全局错误处理
└── uploads/             # 文件存储目录（gitignore 建议）
```

---

## ⚙️ 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | ≥ 18.0 |
| MySQL | ≥ 5.7（推荐 8.0）|
| npm | ≥ 9.0 |

---

## 🔧 安装步骤

### 1. 安装依赖

```bash
cd "F:\个人文件\新安全看板\server"
npm install
```

### 2. 配置环境变量

复制 `.env` 并修改数据库密码：

```bash
# .env 关键配置项
DB_HOST=localhost
DB_PORT=5432
DB_USER=hse_app
DB_PASSWORD=你的真实密码   # ⚠️ 不要用 your_password
DB_NAME=safety-dashboard
PORT=3000
UPLOAD_DIR=./uploads
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. 初始化数据库

```sql
-- 在 MySQL 中执行
CREATE DATABASE IF NOT EXISTS ningjin_hse
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE ningjin_hse;

-- 车辆表
CREATE TABLE IF NOT EXISTS vehicles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plate VARCHAR(20) NOT NULL UNIQUE,
  vin VARCHAR(50),
  engine_no VARCHAR(50),
  reg_date DATE,
  model VARCHAR(100),
  owner VARCHAR(50),
  insurance_type VARCHAR(50),
  insurance_start DATE,
  insurance_end DATE,
  premium DECIMAL(10,2) DEFAULT 0,
  vehicle_type VARCHAR(50),
  status VARCHAR(20) DEFAULT '在用',
  remark TEXT,
  is_deleted TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_plate (plate),
  INDEX idx_insurance_end (insurance_end),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 保险历史表
CREATE TABLE IF NOT EXISTS insurance_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  vehicle_id INT NOT NULL,
  plate VARCHAR(20) NOT NULL,
  insurance_type VARCHAR(50),
  start_date DATE,
  end_date DATE,
  premium DECIMAL(10,2) DEFAULT 0,
  policy_no VARCHAR(100),
  insurer VARCHAR(100),
  is_current TINYINT DEFAULT 1,
  remark TEXT,
  is_deleted TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  INDEX idx_vehicle_id (vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## ▶️ 启动服务

### 开发模式（自动重启）

```bash
cd "F:\个人文件\新安全看板\server"
npm run dev
```

### 生产模式

```bash
cd "F:\个人文件\新安全看板\server"
npm start
```

### 成功启动输出

```
[DB] MySQL连接池初始化成功
[SERVER] HSE后端服务启动成功
[SERVER] 服务端口: http://localhost:3000
[SERVER] API文档: http://localhost:3000/api/health
[SERVER] 静态文件: http://localhost:3000/
```

---

## 🔌 API 端点文档

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 服务健康检查（返回数据库 ping）|

**响应示例：**
```json
{
  "code": 0,
  "success": true,
  "message": "服务正常",
  "data": {
    "ping": 1,
    "timestamp": "2026-07-04T01:00:00.000Z"
  }
}
```

---

### 车辆保险模块 (`/api/vehicles`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vehicles` | 车辆列表（分页 + 筛选 + 排序）|
| GET | `/api/vehicles/:id` | 车辆详情（含保险历史）|
| POST | `/api/vehicles` | 新增车辆 |
| PUT | `/api/vehicles/:id` | 更新车辆 |
| DELETE | `/api/vehicles/:id` | 删除车辆（软删除）|
| GET | `/api/vehicles/expiring` | 到期预警列表 |
| GET | `/api/vehicles/export` | Excel 导出 |
| POST | `/api/vehicles/import` | Excel 批量导入 |

#### 查询参数（GET /api/vehicles）

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页条数 |
| keyword | string | - | 关键词搜索（车牌/车架号/车型/所有人）|
| insuranceType | string | - | 保险类型筛选 |
| status | string | - | 状态筛选（在用/停用）|
| expiringDays | number | - | 到期天数预警 |
| sortBy | string | id | 排序字段 |
| sortOrder | string | DESC | 排序方向（ASC/DESC）|

---

### 文件管理模块 (`/api/files`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/files/upload/image` | 上传图片 |
| POST | `/api/files/upload/document` | 上传文档（PDF/Word）|
| POST | `/api/files/upload/insurance` | 上传保险单 |
| POST | `/api/files/upload/hazard` | 上传隐患照片 |
| POST | `/api/files/upload/multi` | 批量上传 |
| POST | `/api/files/delete` | 删除文件 |
| GET | `/api/files/download/:type/:filename` | 下载文件 |

#### 支持的文件类型

| 类型 | 扩展名 | MIME 类型 |
|------|--------|-----------|
| 图片 | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp` | `image/*` |
| 文档 | `.pdf`, `.doc`, `.docx` | `application/pdf`, `application/msword` 等 |
| 表格 | `.xlsx`, `.xls` | Excel MIME |
| 保险单 | 图片 + PDF + Excel | 混合类型 |

> ⚠️ **安全说明**：上传文件会进行**双校验**（MIME 类型 + 文件扩展名 + **魔术字节签名**），伪造文件类型会被拒绝。

---

## 🚀 与前端联调

### 方式一：后端服务 + 前端静态文件（推荐）

后端已配置静态文件服务，启动后直接访问：

```
http://localhost:3000/
```

前端 `api_client.js` 配置（`index.html` 中）：

```javascript
// 确保 API_BASE 指向后端端口
window.__API_BASE = 'http://localhost:3000/api';
```

### 方式二：纯前端 localStorage 模式（无需后端）

不启动后端，`api_client.js` 中将 `useBackendApi` 设为 `false`，所有数据存在浏览器本地。

---

## 🔒 安全配置说明

### 已启用的安全措施

| 措施 | 说明 |
|------|------|
| **Helmet** | 设置安全响应头（XSS 过滤、点击劫持防护、HSTS）|
| **CORS 白名单** | `ALLOWED_ORIGINS` 未配置时**拒绝所有跨域请求**（不再默认 `*`）|
| **速率限制** | 每 15 分钟最多 100 次请求（可通过 `.env` 调整）|
| **响应压缩** | 使用 `compression` 中间件，减少传输体积 |
| **文件魔术字节校验** | 上传后验证文件头签名，防止扩展名伪造 |
| **SQL 参数化** | 所有数据库查询使用参数化查询，防止 SQL 注入 |
| **文件名随机化** | 上传文件以 `时间戳+随机字符串` 重命名，防止目录遍历 |

### ⚠️ 生产环境必改项

1. **修改 `.env` 中的 `DB_PASSWORD`** 为强密码
2. **明确配置 `ALLOWED_ORIGINS`**，不要用 `*`
3. **添加 HTTPS**（使用反向代理如 Nginx）
4. **添加认证中间件**（如 JWT），当前所有 API 无访问控制
5. **定期备份数据库**

---

## 🐛 故障排查

### 问题：启动后显示 `[DB] MySQL连接池初始化失败`

**原因**：数据库未启动或密码错误

```bash
# 检查 MySQL 是否运行
mysql -u root -p -h localhost -P 3306

# 检查数据库是否存在
SHOW DATABASES LIKE 'ningjin_hse';
```

### 问题：前端控制台 CORS 错误

**原因**：`ALLOWED_ORIGINS` 未包含前端地址

```
# .env 中添加前端地址
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### 问题：文件上传失败（413 Request Entity Too Large）

**原因**：请求体大小超过限制

```
# .env 中调整（当前默认 10MB）
MAX_FILE_SIZE=20971520
```

---

## 📊 性能优化建议

1. **数据库索引**：已在 `vehicles` 表添加 `plate`、`insurance_end`、`status` 索引
2. **连接池**：当前配置 10 连接，高并发时可调整 `config/db.js` 中 `connectionLimit`
3. **启用 Gzip**：已通过 `compression` 中间件启用
4. **添加 Redis 缓存**：对频繁查询（如车辆列表）可添加 Redis 缓存层

---

## 📝 更新日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-07-04 | v1.1 | 添加 Helmet/CORS 速率限制/压缩中间件；添加文件魔术字节校验；完善 README |
| 2026-06-XX | v1.0 | 初始版本 |

---

## 📞 联系方式

- 项目：宁津 HSE 安全管理系统
- 维护：HSE Data Team
- 协议：MIT
