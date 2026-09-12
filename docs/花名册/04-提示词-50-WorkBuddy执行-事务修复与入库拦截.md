# 提示词-50：花名册导入 — SAVEPOINT 事务修复 + 入库拦截 + 错误提示转换

> 编号：提示词-50
> 日期：2026-07-30
> 性质：**后端 P0 + 前端 P1**
> 前置：提示词-49 已完成的改动（模板下载、更多操作下拉、状态颜色、直接上级匹配）
> 关联参考：`docs/花名册/02-PostgreSQL事务报错分析与修复方案.md`

---

## 0. 背景

花名册导入的「确认入库」功能存在三个问题：

1. **P0 — 事务报错**：入库使用单一大事务，某行数据异常导致整个事务 abort，后续所有行无法入库，前端收到 PostgreSQL 原始错误 "current transaction is aborted..."
2. **P1 — 前端缺少拦截**：存在未审核的异常数据时仍可点击"确认入库"
3. **P1 — 错误提示不友好**：PostgreSQL 原始异常直接抛给前端

本次修复涉及 2 个文件，红线约束不变。

---

## 1. 任务 A（P0）：入库事务 SAVEPOINT 改造

**文件**：`server/routes/hse-employee-import-v2.js`
**位置**：`POST /batch/:batchId/import` 路由，当前 L933-1090

### 1.1 当前代码（问题所在）

```js
try {
  await client.query('BEGIN');

  for (const p of pendingResult.rows) {
    try {
      // 员工匹配 + 创建/更新 + employee_assignment 写入
      // ...
    } catch (rowErr) {
      failedCount++;
      errors.push(`row ${p.row_num}: ${rowErr.message}`);
      // ❌ 事务已 abort，后续行全部失败
    }
  }

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
}
```

### 1.2 修复方案：SAVEPOINT 逐行保护

将 `for` 循环体改为 SAVEPOINT 模式：

```js
try {
  await client.query('BEGIN');

  for (let i = 0; i < pendingResult.rows.length; i++) {
    const p = pendingResult.rows[i];
    const spName = `sp_${i}`;

    try {
      await client.query(`SAVEPOINT ${spName}`);

      // ====== 以下是原有的逐行处理逻辑，完全不变 ======
      let employeeId = null;
      // ... 员工匹配、创建/更新、employee_assignment 写入 ...
      // ====== 原有逻辑到此结束 ======

      await client.query(`RELEASE SAVEPOINT ${spName}`);
    } catch (rowErr) {
      await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
      failedCount++;
      errors.push(`第${p.row_num}行: ${rowErr.message}`);
    }
  }

  // 更新批次状态
  await client.query(
    `UPDATE employee_import_batch
     SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [failedCount > 0 ? 'partial_completed' : 'completed', batchId]
  );

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

**关键改动**：
- 在每行处理前加 `SAVEPOINT sp_${i}`
- 成功时 `RELEASE SAVEPOINT`
- 失败时 `ROLLBACK TO SAVEPOINT`（恢复事务到该行之前的状态，不影响已成功的行）
- `for...of` 改为 `for (let i = 0; ...)` 以便生成 savepoint 名称

**注意**：原有的 `try { ... } catch (rowErr) { ... }` 块保持不变，只需在 try 块开头加 `SAVEPOINT`，在 catch 块开头加 `ROLLBACK TO SAVEPOINT`。

---

## 2. 任务 B（P1）：前端入库前拦截

**文件**：`views/hse/employee-import-v2/index.vue`
**位置**：`openImportConfirm()` 函数（当前 L358-367）

### 2.1 当前代码

```ts
function openImportConfirm() {
  if (!currentBatch.value) return;
  Modal.confirm({
    title: '确认入库',
    content: `即将把该批次所有已通过 (approved) 的记录写入员工主数据，是否继续？`,
    okText: '确认入库',
    cancelText: '取消',
    onOk: handleExecuteImport,
  });
}
```

### 2.2 替换为

```ts
function openImportConfirm() {
  if (!currentBatch.value) return;

  // 检查是否有未审核的异常数据
  const pendingItems = pendingList.value.filter((p) => p.status === 'pending');
  if (pendingItems.length > 0) {
    Modal.warning({
      title: '存在未审核的异常数据',
      content: `当前批次有 ${pendingItems.length} 条异常数据处于"待审核"状态。请先完成审核（通过/拒绝）后再执行入库。`,
      okText: '我知道了',
    });
    return;
  }

  // 检查是否有可入库的数据
  const approvedItems = pendingList.value.filter((p) => p.status === 'approved');
  if (approvedItems.length === 0) {
    Modal.warning({
      title: '无可入库数据',
      content: '当前批次没有"已通过"状态的记录，请先审核通过后再入库。',
      okText: '我知道了',
    });
    return;
  }

  Modal.confirm({
    title: '确认入库',
    content: `即将把 ${approvedItems.length} 条已通过 (approved) 的记录写入员工主数据，是否继续？`,
    okText: '确认入库',
    cancelText: '取消',
    onOk: handleExecuteImport,
  });
}
```

**注意**：`pendingList` 需要先加载（调用 `loadPendingList()`），所以在 `openImportConfirm` 被调用前，用户已经打开了详情抽屉并加载了 pending 列表。如果调用时 `pendingList` 为空，拦截逻辑会提示"无可入库数据"。

---

## 3. 任务 C（P1）：后端错误提示转换

**文件**：`server/routes/hse-employee-import-v2.js`
**位置**：在 `inferPersonType` 函数之后、`// API 路由` 注释之前，新增 `formatDbError` 函数

### 3.1 新增代码

```js
/**
 * 将 PostgreSQL 原始错误转换为用户可读的中文提示
 */
function formatDbError(err) {
  const msg = err.message || '';
  if (msg.includes('current transaction is aborted')) {
    return '数据入库异常：部分数据格式不符合数据库要求，请联系管理员检查数据完整性';
  }
  if (msg.includes('duplicate key')) {
    return '数据冲突：员工编号或身份证号已存在，请检查重复数据';
  }
  if (msg.includes('violates not-null constraint')) {
    return '必填字段缺失：请检查员工姓名、身份证号等必填字段是否填写完整';
  }
  if (msg.includes('value too long')) {
    return '字段超长：部分文本字段超过了数据库允许的最大长度';
  }
  return `数据库错误：${msg}`;
}
```

### 3.2 应用到路由的 catch 块

在 `POST /batch/:batchId/import` 路由末尾的 catch 中（当前 L1085 附近）：

```js
} catch (err) {
  res.json(error(-1, formatDbError(err)));  // 原来是 res.json(error(-1, err.message))
}
```

同时检查同文件中其他路由的 catch 块（`/upload`、`/batches`、`/pending/:id/resolve` 等），将 `err.message` 替换为 `formatDbError(err)`。

---

## 4. 红线约束（必须遵守）

- 禁止修改路由定义
- 禁止修改菜单配置
- 禁止修改组件库（Ant Design Vue）
- 禁止修改其他模块代码
- 禁止修改 `employee` / `employee_assignment` 表结构
- 禁止修改登录代码
- 仅改 2 个文件

---

## 5. 验证清单

### 任务 A 验证
- [ ] `node --check server/routes/hse-employee-import-v2.js` 语法通过
- [ ] 重启后端服务
- [ ] 构造一条非法数据（如超长文本）混入 pending 记录，确认入库后该行被跳过，其他行正常入库
- [ ] 入库完成后批次状态：全部成功→`completed`，部分失败→`partial_completed`
- [ ] 失败记录在 `importResult.errors` 中正确展示

### 任务 B 验证
- [ ] 存在未审核（status=pending）的异常数据时，点击"确认入库"弹出警告："存在未审核的异常数据"
- [ ] 全部已审核但无 approved 记录时，点击"确认入库"弹出警告："无可入库数据"
- [ ] 正常情况（有 approved 记录）弹出确认框，显示具体入库数量

### 任务 C 验证
- [ ] 触发一个数据库错误场景，确认前端收到的是中文友好提示而非原始 SQL 错误

---

## 6. 改动文件清单

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `server/routes/hse-employee-import-v2.js` | 入库事务 SAVEPOINT 改造 | P0 |
| `server/routes/hse-employee-import-v2.js` | 新增 `formatDbError()` + 全路由 catch 替换 | P1 |
| `views/hse/employee-import-v2/index.vue` | `openImportConfirm()` 入库前拦截 | P1 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`01-花名册表头分析与优化建议.md`、`02-PostgreSQL事务报错分析与修复方案.md`