# 提示词-120 — department 读接口补齐 org_unit_id

> 关联前序：`98-提示词-119-验证报告.md`（遗留项第 8 节）
> 关联提示词：`97-提示词-118-双轨制方案C`（前端 org-center.vue 依赖此字段）
> 执行时间：2026-08-01
> 执行人：Senior Developer（高级开发工程师 / 吴八哥）

## 1. 背景与根因

`department.org_unit_id` 列已于 v110 迁移创建（`server/sql/hse_department_org_unit_mapping_v110_migration.sql`），写入路径（新建部门、改名、批量导入）已正确填充该列，但两个读接口的 SELECT 子句遗漏了该列。

**影响**：
- 前端 `org-center.vue` 的 `relatedDepts` 计算（关联班组映射）无法使用主路径（`org_unit_id` 精确匹配），只能走前缀反向兜底（`ouName.startsWith(d.name)`）
- 班组与作业中心的关联映射不精确，依赖名字字符串匹配，稳定性差

## 2. 修改范围（红线）

**唯一改动文件**：`F:\hse-dashboard\server\routes\hse-employee.js`

**禁止修改项**：
- 前端页面（`org-center.vue`、`employee.ts` 等）
- 数据库（DDL / DML）
- 路由定义、其他路由文件、中间件
- 其他模块（考核、应急、违章等）

## 3. 修改点

### 3.1 GET /departments/tree（约第 1207-1211 行）

**当前**：
```sql
SELECT id, dept_code, name, short_name, parent_id, level, path, township,
        manager_id, safety_manager_id, headcount, sort_order, status, description
FROM department WHERE ${condition} ORDER BY sort_order ASC, id ASC
```

**修改为**：
```sql
SELECT id, dept_code, name, short_name, parent_id, level, path, township,
        manager_id, safety_manager_id, headcount, sort_order, status, description,
        org_unit_id
FROM department WHERE ${condition} ORDER BY sort_order ASC, id ASC
```

> 注意：树接口返回原始 snake_case（第 1261 行 `res.json(success(...))`），无需 camelKeys 转换。`org_unit_id` 字段名保持不变即可。

### 3.2 GET /departments（约第 1272-1276 行）

**当前**：
```sql
SELECT id, dept_code, name, short_name, parent_id, level, path, township,
        manager_id, safety_manager_id, headcount, sort_order, status, description
FROM department WHERE is_deleted = false ORDER BY level ASC, sort_order ASC
```

**修改为**：
```sql
SELECT id, dept_code, name, short_name, parent_id, level, path, township,
        manager_id, safety_manager_id, headcount, sort_order, status, description,
        org_unit_id
FROM department WHERE is_deleted = false ORDER BY level ASC, sort_order ASC
```

> 注意：列表接口经 `camelKeys` 转换（第 1277 行），`org_unit_id` → `orgUnitId`。前端 `org-center.vue` 使用 `(d as any).org_unit_id` 读取，需确认 camelKeys 转换后字段名为 `orgUnitId`。若前端逻辑需同步调整，允许修改 `org-center.vue` 中 `relatedDepts` 的读取方式（`org_unit_id` → `orgUnitId`），但禁止修改其他前端文件。

## 4. 验证步骤

### 4.1 静态校验
```bash
node --check server/routes/hse-org-center.js
node --check server/routes/hse-employee.js
```

### 4.2 运行时探针（curl）
```bash
# 树接口：确认响应节点包含 org_unit_id
curl -s http://localhost:3001/api/hse/departments/tree | jq '.data[0] | {id, name, org_unit_id}'

# 列表接口：确认响应包含 orgUnitId（camelKeys 转换后）
curl -s http://localhost:3001/api/hse/departments | jq '.data[0] | {id, name, orgUnitId}'
```

期望：两个接口均返回 `org_unit_id` / `orgUnitId` 字段，值非 null（对于已映射的部门）。

### 4.3 前端联调
- 打开"作业中心"页面（`/personnel/org-center`）
- 左侧选择一个组织节点
- 右侧"关联班组"表格应展示该组织关联的班组列表
- 验证：走主路径（`org_unit_id` 精确匹配）而非前缀兜底

### 4.4 构建验证
```bash
cd F:\hse-dashboard\安全看板vben
pnpm --filter @vben/web-antd exec vite build --mode production --minify false
```
确认 `BUILD_EXIT=0`。

## 5. 交付物

- `F:\hse-dashboard\server\routes\hse-employee.js`（已修改 2 处 SELECT）
- 本提示词：`F:\hse-dashboard\docs\花名册\99-提示词-120-department读接口补齐org_unit_id.md`
- 验证报告：`F:\hse-dashboard\docs\花名册\99-提示词-120-验证报告.md`（执行后生成）

## 6. 回滚方案

若出现异常，回滚方式：
```bash
cd F:\hse-dashboard
git checkout -- server/routes/hse-employee.js
pm2 restart hse-dashboard
```