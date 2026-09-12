# Sprint5.1.1 生产加固报告

> 依据：Sprint5.1 开发完成报告  
> 范围：仅生产加固，不扩展业务  
> 执行时间：2026-07-19  
> 测试结果：Sprint5.1 原有 69/69 + Sprint5.1.1 新增 51/51 = **120/120 全部通过**

---

## 一、任务清单

| 序号 | 加固项 | 状态 |
|------|--------|------|
| 1 | `employee_history` 增加 `operator_id` 记录操作人 | ✅ |
| 2 | `employee` 增加 `id_card_hash` / `phone_hash` 解决 AES 随机 IV 唯一性问题 | ✅ |
| 3 | 员工导入增加 Excel 支持（模板/上传/预览/校验/错误报告） | ✅ |
| 4 | 增加权限测试（admin / safety_manager / 普通用户） | ✅ |
| 5 | 保持约束：不修改 Vben 核心目录 / 不修改 auth/JWT / 不新增依赖 | ✅ |

---

## 二、数据库迁移

### 2.1 迁移脚本

**文件**：[server/sql/hse_employee_master_v60_hardening.sql](file:///f:/deploy/hse-dashboard/server/sql/hse_employee_master_v60_hardening.sql)  
**版本**：v60（紧接 v59）  
**方式**：增量迁移，仅 ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS，不删除字段，不修改已有数据结构

### 2.2 变更内容

```sql
-- 1. employee_history 增加操作人
ALTER TABLE employee_history ADD COLUMN IF NOT EXISTS operator_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_emp_history_operator
    ON employee_history(operator_id) WHERE is_deleted = false;

-- 2. employee 增加哈希列（解决 AES-GCM 随机 IV 不可比较问题）
ALTER TABLE employee ADD COLUMN IF NOT EXISTS id_card_hash VARCHAR(64);
ALTER TABLE employee ADD COLUMN IF NOT EXISTS phone_hash   VARCHAR(64);

-- 3. 哈希列部分唯一索引（仅对非 NULL 且未软删的记录生效）
CREATE UNIQUE INDEX IF NOT EXISTS uk_employee_idcard_hash
    ON employee (id_card_hash) WHERE id_card_hash IS NOT NULL AND is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uk_employee_phone_hash
    ON employee (phone_hash) WHERE phone_hash IS NOT NULL AND is_deleted = false;
```

### 2.3 执行结果

```
BEGIN
ALTER TABLE        -- employee_history.operator_id
CREATE INDEX       -- idx_emp_history_operator
COMMENT
ALTER TABLE        -- employee.id_card_hash
ALTER TABLE        -- employee.phone_hash
DO                 -- uk_employee_idcard_hash
DO                 -- uk_employee_phone_hash
COMMENT
COMMENT
COMMIT

 table_name      | column_name  |     data_type
------------------+--------------+-------------------
 employee         | id_card_hash | character varying
 employee         | phone_hash   | character varying
 employee_history | operator_id  | bigint
(3 rows)
```

### 2.4 历史数据兼容

- 历史 `employee_history.operator_id` 为 NULL，表示历史变动记录无操作人信息（兼容已有数据）
- 历史 `employee.id_card_hash` / `phone_hash` 为 NULL，部分唯一索引仅对非 NULL 值生效，不影响现有查询
- 新增/更新员工时由应用层计算并写入哈希值；如需补齐历史数据，可由应用层批量解密+哈希回填（不在本脚本范围）

---

## 三、技术方案

### 3.1 AES-GCM 随机 IV 唯一性问题

**问题背景**：Sprint5.1 使用 AES-256-GCM 加密身份证号、手机号，每次加密使用随机 IV，导致相同明文每次产生不同密文。SQL 层 `WHERE id_card = $1` 无法匹配已加密记录，**无法做唯一性校验**——可能出现同一身份证号被重复录入。

**解决方案**：新增 HMAC-SHA256 确定性哈希列。相同明文 + 相同密钥产生相同哈希，在数据库层建立唯一索引实现唯一性校验。

**secureEncode 模式**：

```
明文 → { cipher: AES-GCM(plaintext), hash: HMAC-SHA256(plaintext) }
            ↓                              ↓
       id_card / phone 列            id_card_hash / phone_hash 列
       （随机 IV，不可比较）           （确定性，可建立唯一索引）
```

### 3.2 encryptMiddleware 移除

**问题**：Sprint5.1 的 `encryptMiddleware` 在路由前将 `req.body.id_card` 替换为密文，导致路由内无法再计算哈希。

**方案**：移除 `encryptMiddleware`，在路由内部手动调用 `encrypt()` + `hashSensitive()`，通过 `secureEncode()` 同时得到密文和哈希。

### 3.3 Excel 导入方案

**约束**：不新增前端依赖。

**方案**：Excel 解析全部在后端完成（复用已有 `xlsx@0.18.5` 依赖），前端仅负责上传文件和展示预览结果。

- 模板下载：`XLSX.utils.json_to_sheet()` + `XLSX.write(buffer)`
- 文件上传：`multer` (`uploadExcel.single('file')`)
- 魔术字节校验：`validateUploadedFile(req.file, 'excel')` 防伪造
- 解析：`XLSX.readFile()` + `XLSX.utils.sheet_to_json(ws, { defval: '' })`
- 校验：逐行 `validateEmployeeRow()` 检查姓名、身份证格式、手机号格式、日期格式、人员类型枚举

---

## 四、修改文件清单

### 4.1 新建文件

| 文件路径 | 用途 |
|---------|------|
| [server/sql/hse_employee_master_v60_hardening.sql](file:///f:/deploy/hse-dashboard/server/sql/hse_employee_master_v60_hardening.sql) | v60 加固迁移脚本 |
| [server/__tests__/hse-employee.permissions.test.js](file:///f:/deploy/hse-dashboard/server/__tests__/hse-employee.permissions.test.js) | 权限测试脚本（admin/safety_manager/viewer） |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| [server/utils/encryption.js](file:///f:/deploy/hse-dashboard/server/utils/encryption.js) | 新增 `hashSensitive(plaintext)` HMAC-SHA256 函数 |
| [server/routes/hse-employee.js](file:///f:/deploy/hse-dashboard/server/routes/hse-employee.js) | 移除 encryptMiddleware、新增 secureEncode、哈希唯一性校验、operator_id 记录、3 个 Excel 导入端点 |
| [安全看板vben/apps/web-antd/src/api/hse/employee.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/employee.ts) | 新增 `downloadEmployeeImportTemplate` / `previewEmployeeExcel` / `importEmployeeExcel` 三个 API |
| [安全看板vben/apps/web-antd/src/views/hse/employee/components/EmployeeImportModal.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/employee/components/EmployeeImportModal.vue) | 双模式导入（Excel 推荐 / JSON）、模板下载、预览+校验错误展示 |

---

## 五、后端改造详情

### 5.1 encryption.js — 新增 hashSensitive

[server/utils/encryption.js#L122-L139](file:///f:/deploy/hse-dashboard/server/utils/encryption.js#L122-L139)

```javascript
/**
 * 计算敏感字段的 HMAC-SHA256 哈希（用于唯一性校验）
 * 使用与加密相同的密钥，相同明文产生相同哈希
 */
function hashSensitive(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return null;
  const key = getEncryptionKey();
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(plaintext);
  return hmac.digest('hex'); // 64 字符 hex
}
```

### 5.2 hse-employee.js — secureEncode 辅助函数

[server/routes/hse-employee.js#L86-L98](file:///f:/deploy/hse-dashboard/server/routes/hse-employee.js#L86-L98)

```javascript
function secureEncode(plaintext) {
  if (!plaintext) return { cipher: null, hash: null };
  return {
    cipher: encrypt(plaintext),
    hash: hashSensitive(plaintext),
  };
}
```

### 5.3 POST /employees — 哈希唯一性校验

[server/routes/hse-employee.js#L391-L408](file:///f:/deploy/hse-dashboard/server/routes/hse-employee.js#L391-L408)

```javascript
const idCardEnc = secureEncode(id_card);
const phoneEnc = secureEncode(phone);
if (idCardEnc.hash) {
  const existIdCard = await pool.query(
    `SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false`,
    [idCardEnc.hash]
  );
  if (existIdCard.rows.length > 0) return res.json(error(-4, '身份证号已存在'));
}
if (phoneEnc.hash) {
  const existPhone = await pool.query(
    `SELECT id FROM employee WHERE phone_hash = $1 AND is_deleted = false`,
    [phoneEnc.hash]
  );
  if (existPhone.rows.length > 0) return res.json(error(-4, '手机号已存在'));
}
// INSERT 同时写入 cipher 和 hash
```

### 5.4 PUT /employees/:id — 哈希唯一性校验（排除自身）

[server/routes/hse-employee.js#L439-L449](file:///f:/deploy/hse-dashboard/server/routes/hse-employee.js#L439-L449)

```javascript
const idCardEnc = secureEncode(updates.id_card);
const phoneEnc = secureEncode(updates.phone);
if (idCardEnc.hash) {
  const existIdCard = await pool.query(
    `SELECT id FROM employee WHERE id_card_hash = $1 AND id != $2 AND is_deleted = false`,
    [idCardEnc.hash, req.params.id]
  );
  if (existIdCard.rows.length > 0) return res.json(error(-4, '身份证号已存在'));
}
// phone 同理
```

### 5.5 employee_history INSERT — operator_id 记录

[server/routes/hse-employee.js#L949](file:///f:/deploy/hse-dashboard/server/routes/hse-employee.js#L949)（调岗）  
[server/routes/hse-employee.js#L1031](file:///f:/deploy/hse-dashboard/server/routes/hse-employee.js#L1031)（状态变更）

```sql
INSERT INTO employee_history (
  employee_id, event_type, event_date,
  before_dept_id, after_dept_id, before_position_id, after_position_id,
  before_status, after_status, remark,
  operator_id   -- 新增字段，值来自 req.user.id
) VALUES (...)
```

### 5.6 GET /history/employee/:employeeId — 关联用户表返回操作人

[server/routes/hse-employee.js#L1072-L1084](file:///f:/deploy/hse-dashboard/server/routes/hse-employee.js#L1072-L1084)

```sql
SELECT eh.*, 
       eh.operator_id,
       u.username  AS operator_name,
       u.real_name AS operator_real_name
FROM employee_history eh
LEFT JOIN users u ON eh.operator_id = u.id
WHERE eh.employee_id = $1 ...
```

### 5.7 新增 Excel 导入端点

| 方法 | 路径 | 权限 | 功能 |
|------|------|------|------|
| GET  | `/employees/import/template` | admin, safety_manager | 下载 xlsx 模板（含示例行 + 列宽） |
| POST | `/employees/import/excel/preview` | admin, safety_manager | 上传 Excel → 解析 → 逐行校验 → 返回预览（不写库） |
| POST | `/employees/import/excel` | admin, safety_manager | 上传 Excel → 解析 → 校验 → 直接导入 |

**预览返回结构**：

```json
{
  "success": true,
  "data": {
    "totalRows": 3,
    "validRows": 1,
    "invalidRows": 2,
    "errors": [
      { "rowIndex": 2, "field": "身份证号", "message": "身份证号格式错误" },
      { "rowIndex": 3, "field": "姓名", "message": "姓名不能为空" }
    ],
    "preview": [{ "rowIndex": 1, "data": { "...": "..." }, "errors": [] }]
  }
}
```

**直接导入返回结构**：

```json
{
  "success": true,
  "data": { "total": 3, "success": 2, "failed": 1, "errors": ["..."] }
}
```

### 5.8 Excel 字段映射

| 中文表头 | 数据库字段 | 必填 | 校验规则 |
|---------|-----------|------|---------|
| 工号 | employee_code | 否 | — |
| 姓名 | name | 是 | 非空 |
| 性别 | gender | 否 | 男/女 |
| 出生日期 | birth_date | 否 | YYYY-MM-DD 或 Excel 序列号 |
| 身份证号 | id_card | 否 | 18 位（首位非 X，末位 0-9 或 X） |
| 手机号 | phone | 否 | 11 位数字，首位为 1 |
| 人员分类 | person_category | 否 | 适龄人员/超龄人员 |
| 人员类型 | person_type | 否 | 管理人员/技术人员/生产人员/辅助人员 |
| 入职日期 | hire_date | 否 | 日期格式 |

---

## 六、前端改造详情

### 6.1 employee.ts — 新增 3 个 API

[安全看板vben/apps/web-antd/src/api/hse/employee.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/employee.ts)

```typescript
// 1. 下载 Excel 模板（blob）
export async function downloadEmployeeImportTemplate() {
  return requestClient.get(`${BASE}/employees/import/template`, {
    responseType: 'blob',
  });
}

// 2. Excel 预览（FormData 上传）
export async function previewEmployeeExcel(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<EmployeeApi.ExcelPreviewResult>(
    `${BASE}/employees/import/excel/preview`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

// 3. Excel 直接导入
export async function importEmployeeExcel(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<EmployeeApi.ImportResult>(
    `${BASE}/employees/import/excel`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}
```

### 6.2 EmployeeImportModal.vue — 双模式导入

**Excel 模式流程**（推荐）：
1. 用户点击「下载模板」获取 xlsx 模板（后端生成）
2. 用户填好模板后选择文件上传
3. 前端调用 `previewEmployeeExcel` 上传到后端预览
4. 后端返回 `totalRows / validRows / invalidRows / errors / preview`
5. 前端展示预览表格 + 校验错误列表
6. 用户确认后点击「开始导入」，前端调用 `importEmployeeExcel`

**JSON 模式流程**（兼容 Sprint5.1）：
1. 用户选择 .json 文件
2. 前端 `FileReader.readAsText` 解析 JSON
3. 展示预览
4. 用户确认后调用 `importEmployees`（Sprint5.1 已有 API）

**UI 组件**：使用 `a-radio-group` 切换模式，`a-upload` 选择文件，`a-table` 展示预览，`a-alert` 展示错误。

---

## 七、权限测试报告

### 7.1 测试脚本

**文件**：[server/__tests__/hse-employee.permissions.test.js](file:///f:/deploy/hse-dashboard/server/__tests__/hse-employee.permissions.test.js)  
**运行命令**：`node __tests__/hse-employee.permissions.test.js`

### 7.2 测试用户准备

- **admin**：系统默认管理员（admin/admin123），role=admin
- **safety_manager**：测试自动创建（`{MARKER}_sm` / Test@123456），role=safety_manager
- **viewer**：测试自动创建（`{MARKER}_viewer` / Test@123456），role=viewer
- 测试结束自动清理临时用户及关联数据

### 7.3 测试结果（51/51 通过）

| 模块 | 测试项 | 通过数 |
|------|--------|--------|
| 一、admin 角色权限 | 创建部门/岗位/员工、调岗、更新、状态变更、批量导入、读操作、查询历史 | 10/10 |
| 二、safety_manager 角色权限 | 与 admin 相同的写操作 | 9/9 |
| 三、viewer 角色权限 | 写操作 10 项全部 403 + 读操作 3 项全部 200 | 13/13 |
| 四、未登录访问 | 无 Token / 无效 Token 全部 401 | 4/4 |
| 五、operator_id 记录验证 | 历史记录含 operator_id（=admin userId）+ operator_name | 3/3 |
| 六、哈希唯一性校验 | 重复身份证号/手机号被拒绝（code=-4） | 4/4 |
| 七、Excel 导入端点 | 模板下载/预览/直接导入 | 8/8 |
| **合计** | | **51/51** |

### 7.4 关键验证点

#### 7.4.1 角色权限边界

```
3.1  viewer 创建部门被拒绝 (403)        ✓
3.2  viewer 创建岗位被拒绝 (403)        ✓
3.3  viewer 创建员工被拒绝 (403)        ✓
3.4  viewer 更新员工被拒绝 (403)        ✓
3.5  viewer 删除员工被拒绝 (403)        ✓
3.6  viewer 调岗被拒绝 (403)            ✓
3.7  viewer 状态变更被拒绝 (403)        ✓
3.8  viewer 批量导入被拒绝 (403)        ✓
3.9  viewer Excel导入被拒绝 (403)       ✓
3.10 viewer 下载模板被拒绝 (403)        ✓
3.11 viewer 可读取员工列表              ✓
3.12 viewer 可读取部门树                ✓
3.13 viewer 可查询历史                  ✓
```

#### 7.4.2 operator_id 记录

```
5.1 查询历史成功                                  ✓
5.2 admin操作事件被记录 (operator_id=1)           ✓
   实际返回 operatorIds: ["3","3","1","1"]
   （3=safety_manager 操作，1=admin 操作）
5.3 历史记录含 operator_name 字段                 ✓
```

注：PostgreSQL BIGINT 通过 pg driver 默认返回字符串，测试代码已统一使用 `String(h.operator_id) === String(adminUserId)` 比较。

#### 7.4.3 哈希唯一性校验

```
6.1 重复身份证号被拒绝 (哈希校验生效)    ✓  code=-4
6.2 错误消息含"身份证"                    ✓
6.3 重复手机号被拒绝 (哈希校验生效)        ✓  code=-4
6.4 错误消息含"手机"                      ✓
```

#### 7.4.4 Excel 导入端点

```
7.1 模板下载成功                ✓  status=200
7.2 Content-Type 含 spreadsheet ✓
7.3 Excel预览接口成功           ✓
7.4 解析总行数=3                ✓
7.5 检测到校验错误 (实际=2)      ✓
7.6 Excel导入接口成功           ✓
7.7 成功导入>=2条 (实际=2)       ✓
7.8 失败>=1条 (实际=1)          ✓
```

---

## 八、Sprint5.1 回归测试

### 8.1 测试脚本

**文件**：[server/__tests__/hse-employee.standalone.test.js](file:///f:/deploy/hse-dashboard/server/__tests__/hse-employee.standalone.test.js)  
**运行命令**：`node __tests__/hse-employee.standalone.test.js`

### 8.2 测试结果（69/69 通过）

| 模块 | 测试项 | 通过数 |
|------|--------|--------|
| 一、部门管理 | 五级树新增、编码唯一性、树查询、更新、级联删除校验 | 10/10 |
| 二、岗位管理 | 新增、编码唯一性、按部门过滤、更新 | 5/5 |
| 三、员工管理 | 新增、工号唯一性、搜索、过滤、详情、更新、统计、年龄计算 | 11/11 |
| 四、员工导入 | 批量导入、成功/失败计数、空数组校验 | 5/5 |
| 五、人员组织关系 | 入职、调岗、状态变更（待岗/复岗）、无效状态校验 | 18/18 |
| 六、历史查询 | 入职/调岗/待岗/复岗事件、前后岗位/状态正确性 | 9/9 |
| 七、软删除与清理 | 员工软删除、岗位删除、五级部门级联删除 | 11/11 |
| **合计** | | **69/69** |

### 8.3 结论

后端 Sprint5.1.1 改造（移除 encryptMiddleware、新增 secureEncode + 哈希校验、operator_id 记录）未破坏 Sprint5.1 任何已有功能。

---

## 九、约束遵守说明

### 9.1 不修改 Vben 核心目录

- 未修改 `packages/@core/`、`packages/effects/`、`packages/themes/` 任何文件
- 前端改动仅限 `apps/web-antd/src/api/hse/employee.ts` 和 `apps/web-antd/src/views/hse/employee/components/EmployeeImportModal.vue`
- 使用 Ant Design Vue 官方组件（a-radio-group、a-upload、a-table、a-alert）

### 9.2 不修改 auth/JWT

- 未修改 `server/middleware/auth.js`、`server/routes/auth.js`、JWT 相关任何文件
- 复用已有的 `requireRole(...allowedRoles)` 中间件实现权限控制

### 9.3 不新增依赖

- 后端复用 `xlsx@0.18.5`（已在 package.json）和 `multer@1.4.5-lts.1`（已在 package.json）
- 前端复用 `requestClient`（@vben/request）和 Ant Design Vue 已有组件
- 前端无新增 npm 依赖（Excel 解析全部在后端完成）

### 9.4 不扩展业务

- 仅做生产加固，未新增业务功能
- 所有改动都围绕 4 项加固任务展开：operator_id / 哈希列 / Excel 导入 / 权限测试

### 9.5 数据库增量迁移

- 仅 `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`
- 不删除字段，不修改已有数据结构
- 历史数据 NULL 兼容，部分唯一索引仅对非 NULL 值生效

### 9.6 安全设计

- **AES-256-GCM** 加密敏感字段（随机 IV，密文不可比较）
- **HMAC-SHA256** 哈希列做唯一性校验（确定性，相同明文+相同密钥产生相同哈希）
- **requireRole 中间件** 强制 admin/safety_manager 才能写操作
- **魔术字节校验** 防止 Excel 文件类型伪造
- **FormData + multipart/form-data** 安全上传二进制文件
- **operator_id** 记录所有人事变动的操作人，支持审计追溯

---

## 十、部署说明

### 10.1 数据库迁移

```bash
# 在生产 PostgreSQL 上执行 v60 迁移
psql -h <host> -U <user> -d <database> -f server/sql/hse_employee_master_v60_hardening.sql
```

迁移幂等（IF NOT EXISTS），可重复执行。

### 10.2 后端重启

```bash
cd server
npm start   # 或 pm2 restart ecosystem.config.js
```

无需重新构建，所有改动为运行时 JavaScript。

### 10.3 前端构建

```bash
cd 安全看板vben
pnpm build:antd
```

### 10.4 验证

```bash
# 1. 验证 Sprint5.1 功能
cd server
node __tests__/hse-employee.standalone.test.js

# 2. 验证 Sprint5.1.1 加固
node __tests__/hse-employee.permissions.test.js
```

---

## 十一、已知限制

1. **历史数据哈希为空**：v60 迁移前已存在的 `employee` 记录 `id_card_hash` / `phone_hash` 为 NULL，无法对其做唯一性校验。如需补齐，需编写回填脚本：解密 → 哈希 → UPDATE。
2. **历史 employee_history.operator_id 为空**：v60 迁移前已存在的变动记录 `operator_id` 为 NULL，无法追溯操作人。
3. **密钥一致性要求**：哈希使用与加密相同的 `DATA_ENCRYPTION_KEY`。若密钥变更，所有历史哈希将失效，需同步重新计算所有哈希值。
4. **Excel 单文件限制**：复用 multer 默认配置，单文件最大 10MB。如需更大文件，需调整 `UPLOAD_CONFIG.maxSize`。

---

## 十二、交付物清单

| 类型 | 路径 |
|------|------|
| 迁移脚本 | [server/sql/hse_employee_master_v60_hardening.sql](file:///f:/deploy/hse-dashboard/server/sql/hse_employee_master_v60_hardening.sql) |
| 后端加密工具 | [server/utils/encryption.js](file:///f:/deploy/hse-dashboard/server/utils/encryption.js) |
| 后端路由 | [server/routes/hse-employee.js](file:///f:/deploy/hse-dashboard/server/routes/hse-employee.js) |
| 前端 API | [安全看板vben/apps/web-antd/src/api/hse/employee.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/employee.ts) |
| 前端组件 | [安全看板vben/apps/web-antd/src/views/hse/employee/components/EmployeeImportModal.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/employee/components/EmployeeImportModal.vue) |
| 权限测试 | [server/__tests__/hse-employee.permissions.test.js](file:///f:/deploy/hse-dashboard/server/__tests__/hse-employee.permissions.test.js) |
| Sprint5.1 回归测试 | [server/__tests__/hse-employee.standalone.test.js](file:///f:/deploy/hse-dashboard/server/__tests__/hse-employee.standalone.test.js) |
| 本报告 | [sprint5.1.1-report.md](file:///f:/deploy/hse-dashboard/sprint5.1.1-report.md) |

---

**Sprint5.1.1 生产加固任务完成。**
