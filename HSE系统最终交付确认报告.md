# 宁津环卫HSE安全管理系统 — 最终交付确认报告

> 报告日期：2026-07-15  
> 版本：v1.0 最终交付版  
> 项目代号：宁津环卫 HSE 安全管理系统

---

## 一、核心功能可用性清单

### 1.1 用户与权限
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 用户登录 | `POST /api/auth/login` | ✅ 可用 | 支持用户名/密码登录，返回 JWT Token |
| Token 刷新 | `POST /api/auth/refresh` | ✅ 可用 | 支持 Refresh Token 续期 |
| 用户列表 | `GET /api/users` | ✅ 可用 | 分页查询用户信息 |
| 角色管理 | `GET /api/roles` | ✅ 可用 | 角色与权限配置 |
| 菜单管理 | `GET /api/menus` | ✅ 可用 | 动态菜单与权限控制 |

### 1.2 安全隐患管理
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 隐患列表 | `GET /api/hazards` | ✅ 可用 | 分页、关键词搜索、等级筛选 |
| 隐患详情 | `GET /api/hazards/:id` | ✅ 可用 | 单条隐患完整信息 |
| 新增隐患 | `POST /api/hazards` | ✅ 可用 | 含隐患等级、分类、整改措施 |
| 隐患统计 | `GET /api/hazards/stats` | ✅ 可用 | 按等级/状态/时间维度统计 |
| 模板下载 | `GET /api/import/template/hazards` | ✅ 可用 | CSV 格式导入模板 |

### 1.3 事故管理
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 事故列表 | `GET /api/accidents` | ✅ 可用 | 分页、年度/类型筛选 |
| 事故详情 | `GET /api/accidents/:id` | ✅ 可用 | 完整事故报告 |
| 事故上报 | `POST /api/accidents` | ✅ 可用 | 事故登记与分类 |
| 事故统计 | `GET /api/accidents/stats` | ✅ 可用 | 按类型/月份/乡镇统计 |
| 模板下载 | `GET /api/import/template/accidents` | ✅ 可用 | CSV 格式导入模板 |

### 1.4 人员保险管理
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 人员列表 | `GET /api/insurance/personnel` | ✅ 可用 | 分页、部门/险种筛选 |
| 人员统计 | `GET /api/insurance/personnel/stats` | ✅ 可用 | 参保/过期/即将到期/高危统计 |
| 高危人员分类 | 前端计算 | ✅ 可用 | 5大类：司机、转运站、高空作业、市政井下、其他特种 |
| 保险到期预警 | 前端 Tab | ✅ 可用 | 全部/即将到期/已过期/高危人员 |
| 模板下载 | `GET /api/import/template/personnel` | ✅ 可用 | CSV 格式导入模板 |

### 1.5 目标管理
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 安全责任制 | `GET /api/objectives?type=responsibility` | ✅ 可用 | responsibilities 表 |
| 安全合同 | `GET /api/objectives?type=contract` | ✅ 可用 | contract_signs 表 |
| 组织人员 | `GET /api/objectives?type=org` | ✅ 可用 | org_personnel 表 |
| 安全投入 | `GET /api/objectives?type=budget` | ✅ 可用 | safety_budgets 表 |
| 目标统计 | `GET /api/objectives/stats` | ✅ 可用 | 多表聚合统计 |

### 1.6 培训与应急
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 培训记录 | `GET /api/training/records` | ✅ 可用 | 培训计划与完成记录 |
| 新员工培训 | `GET /api/training/new-employees` | ✅ 可用 | 新员工岗前培训 |
| 培训统计 | `GET /api/training/stats` | ✅ 可用 | 培训完成率/人次统计 |
| 应急预案 | `GET /api/emergency` | ✅ 可用 | 预案列表与详情 |
| 应急演练 | `GET /api/emergency/drills` | ✅ 可用 | 演练记录管理 |
| 模板下载 | `GET /api/import/template/training` | ✅ 可用 | CSV 格式导入模板 |

### 1.7 车辆与设备
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 车辆列表 | `GET /api/vehicles` | ✅ 可用 | 车辆档案管理 |
| 车辆统计 | `GET /api/vehicles/stats` | ✅ 可用 | 车辆类型/状态统计 |
| 模板下载 | `GET /api/import/template/vehicles` | ✅ 可用 | CSV 格式导入模板 |

### 1.8 文件与导入
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 文件上传 | `POST /api/files/upload` | ✅ 可用 | 支持图片/文档/Excel |
| 文件列表 | `GET /api/file-records` | ✅ 可用 | 文件记录管理 |
| 模板下载（27模块） | `GET /api/import/template/:module` | ✅ 可用 | 全部业务模块均有模板 |
| 智能导入解析 | `POST /api/import/parse` | ✅ 可用 | Python 引擎解析 |
| 导入确认 | `POST /api/import/confirm` | ✅ 可用 | 确认入库 |

### 1.9 仪表盘与可视化
| 功能模块 | API 路径 | 状态 | 说明 |
|---------|---------|------|------|
| 综合概览 | `GET /api/dashboard/overview` | ✅ 可用 | 首页综合数据概览 |
| 健康检查 | `GET /api/health` | ✅ 可用 | 服务状态与版本信息 |
| 领导驾驶舱 | `GET /api/hse-dashboard` | ✅ 可用 | v5.1 新增模块 |
| 数据分析 | `GET /api/hse-statistics` | ✅ 可用 | v5.0 新增数据分析中心 |

---

## 二、端口与部署配置

### 2.1 后端端口配置
- **后端服务端口：5666**（已强制固定，清除所有 3000 端口引用）
- **前端开发端口：5173**（Vite 开发服务器）
- **WebSocket 路径：`ws://localhost:5666/ws`**

### 2.2 配置文件位置
| 文件 | 说明 |
|------|------|
| `server/.env` | 环境变量配置（端口、数据库、CORS等） |
| `server/app.js` | 后端主入口，端口默认值 5666 |
| `server/ecosystem.config.js` | PM2 部署配置 |

### 2.3 CORS 配置
已配置允许的前端源：
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5666`
- `http://127.0.0.1:5666`

---

## 三、剩余已知问题

| 序号 | 问题描述 | 影响范围 | 优先级 | 备注 |
|------|---------|---------|--------|------|
| 1 | 部分模块数据库表数据为空（如人员保险表），统计卡片显示 0 | 人员保险、目标管理等 | 低 | 不影响功能，接入真实数据后自动恢复 |
| 2 | 智能导入功能依赖 Python 环境，需配置 `PYTHON_PATH` 环境变量 | 批量导入 | 中 | 未配置时手动录入仍可用 |
| 3 | 培训模块根路径 `/api/training` 无数据，需使用 `/api/training/records` | API 调用 | 低 | 属于设计规范，非 Bug |
| 4 | 前端部分页面仍引用旧端口配置（如有）需同步更新 | 前端配置 | 低 | 建议前端 `.env` 中 `VITE_API_BASE_URL` 指向 5666 |

---

## 四、启动命令

### 4.1 后端启动

**开发模式：**
```bash
cd server
node app.js
# 或
npm start
```

**PM2 生产部署：**
```bash
cd server
pm2 start ecosystem.config.js
pm2 save
```

**验证启动：**
```bash
# 健康检查
curl http://localhost:5666/api/health

# 登录测试
curl -X POST http://localhost:5666/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 4.2 前端启动

**开发模式：**
```bash
cd 安全看板vben
pnpm install
pnpm dev
# 访问 http://localhost:5173
```

**生产构建：**
```bash
cd 安全看板vben
pnpm build
# 产物位于 apps/web-antd/dist/
```

### 4.3 数据库配置

PostgreSQL 连接信息通过 `server/.env` 配置：
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=hse_dashboard
PORT=5666
```

---

## 五、用户操作手册更新建议

### 5.1 建议新增章节

#### 章节1：系统登录与初始配置
- 默认管理员账号：`admin / admin123`
- 首次登录后强制修改密码
- 个人中心：头像、手机号、邮箱配置

#### 章节2：数据导入操作指南
- **下载模板**：各模块列表页点击「下载模板」按钮获取 CSV 模板
- **填写规范**：
  - 日期格式：`YYYY-MM-DD`（如 `2026-07-15`）
  - 枚举值严格按照模板示例填写（如隐患等级：一般/较大/重大）
  - 必填字段不可为空
- **导入流程**：上传文件 → 系统解析预览 → 确认入库 → 查看导入日志

#### 章节3：人员保险高危分类说明
5 大高危岗位自动识别规则：
1. **司机**：岗位含「司机/驾驶/押运」关键词
2. **转运站**：部门/岗位含「转运站/中转站/垃圾站」关键词
3. **高空作业**：岗位含「高空/高处/路灯/登高」关键词
4. **市政井下**：岗位含「井下/有限空间/下水道/窨井」关键词
5. **其他特种**：岗位含「焊工/电工/叉车/起重/特种」关键词

#### 章节4：目标管理模块使用说明
目标管理包含 4 个子模块：
- 安全责任制：各级人员安全职责清单
- 安全合同：员工安全合同签署记录
- 组织人员：安全管理组织架构与人员配置
- 安全投入：年度安全经费预算与使用记录

### 5.2 建议更新的截图与说明
- 更新系统首页仪表盘截图（含所有统计卡片）
- 补充人员保险模块「高危人员」Tab 操作说明
- 补充「下载模板」按钮位置与使用步骤
- 补充端口配置说明（后端 5666 / 前端 5173）

### 5.3 常见问题（FAQ）建议
1. **Q: 打开页面提示跨域错误？**  
   A: 确认后端服务已启动在 5666 端口，且前端 API 地址配置正确。

2. **Q: 点击「下载模板」无反应？**  
   A: 检查浏览器是否拦截了弹出下载，后端模板接口已覆盖全部 27 个业务模块。

3. **Q: 统计卡片显示数据为 0？**  
   A: 部分模块初始数据为空，录入数据或导入历史数据后自动更新。

4. **Q: 后端端口被占用怎么办？**  
   A: 修改 `server/.env` 中的 `PORT` 变量，或使用 `netstat -ano | findstr :5666` 查找并结束占用进程。

---

## 六、本次修复内容汇总

| 序号 | 修复项 | 修复内容 | 涉及文件 |
|------|--------|---------|---------|
| 1 | 端口冲突 | 强制后端固定 5666 端口，清除所有 3000 端口引用 | `server/.env`、`server/app.js`、`server/ecosystem.config.js` |
| 2 | CORS 配置 | 更新允许的源列表，移除 3000 端口，保留 5173 和 5666 | `server/.env`、`server/app.js` |
| 3 | 人员保险 API | 修复 `/api/insurance/personnel` 与 `/stats` 路由，完善数据格式化 | `server/routes/insurance.js`、前端 `insurance.ts` |
| 4 | 目标管理 API | 修复 `/api/objectives` 与 `/stats` 路由，支持 4 种类型切换 | `server/routes/objectives.js` |
| 5 | 下载模板 | 扩展至 27 个业务模块，全部支持中文字段 CSV 模板 | `server/routes/import.js` |
| 6 | 高危人员分类 | 标准化 5 大类关键词匹配，修复高危 Tab 过滤逻辑 | `server/routes/insurance.js`、前端人员保险页面 |

---

## 七、交付确认

| 项目 | 状态 | 确认人 | 日期 |
|------|------|--------|------|
| 后端 API 全部可用 | ✅ | — | 2026-07-15 |
| 端口配置统一（5666） | ✅ | — | 2026-07-15 |
| 下载模板功能完善 | ✅ | — | 2026-07-15 |
| 人员保险模块正常 | ✅ | — | 2026-07-15 |
| 目标管理模块正常 | ✅ | — | 2026-07-15 |
| 交付报告生成 | ✅ | — | 2026-07-15 |

---

> **报告生成时间：2026-07-15 17:50**  
> **后端版本：v4.1（HSE 安全管理系统）**  
> **测试环境：Node.js 24.18.0 + PostgreSQL**
