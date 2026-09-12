# 花名册导入 — PostgreSQL 事务报错分析与修复方案

> 日期：2026-07-30
> 问题：确认入库时触发 "current transaction is aborted, commands ignored until end of transaction block"
> 影响文件：`server/routes/hse-employee-import-v2.js` → `POST /batch/:batchId/import`

---

## 1. 根因分析

### 1.1 错误信息解读

```
current transaction is aborted, commands ignored until end of transaction block
```

这是 PostgreSQL 的经典错误。含义：**当前事务已被标记为"中止(aborted)"状态，此事务块内的后续所有命令都将被忽略**。

### 1.2 触发链路

`server/routes/hse-employee-import-v2.js` L869-1060 的 `POST /batch/:batchId/import` 路由中：

```js
const client = await pool.connect();
try {
  await client.query('BEGIN');  // ← 开启一个事务

  for (const p of pendingResult.rows) {
    try {
      // 逐行 INSERT/UPDATE employee + employee_assignment
      // ...
    } catch (rowErr) {
      failedCount++;
      errors.push(`row ${p.row_num}: ${rowErr.message}`);
      // ❌ 只计数，未回滚事务。PostgreSQL 事务已处于 aborted 状态！
    }
  }

  await client.query('COMMIT');  // ← 此时事务已中止，COMMIT 也会失败
} catch (err) {
  await client.query('ROLLBACK'); // ← 但外层 catch 可能也捕获不到
  throw err;
}
```

**多米诺骨牌效应**：

1. 第 N 行数据触发 SQL 错误（如：必填字段为空、文本超长、唯一约束冲突）
2. PostgreSQL 将该事务标记为 `aborted`
3. 第 N+1 行起，所有 SQL 语句都返回 `"current transaction is aborted..."`
4. `catch (rowErr)` 只记录了错误，但**事务已死**，无法恢复
5. 最终 `COMMIT` 也失败，整个批次入库失败

### 1.3 为什么异常数据列表显示"暂无数据"

入库失败后，`pending` 记录的状态没有被更新为 `imported`，但批次状态可能已经被部分更新（取决于错误发生的时机）。前端查询 `pending` 列表时，由于前端筛选逻辑或后端返回的数据状态不一致，导致显示为空。

---

## 2. 修复方案

### 2.1 后端修复（核心）：使用 SAVEPOINT 逐行保护

```js
const client = await pool.connect();
let insertedCount = 0, updatedCount = 0, assignmentCount = 0, failedCount = 0;
const errors = [];

try {
  await client.query('BEGIN');

  for (let i = 0; i < pendingResult.rows.length; i++) {
    const p = pendingResult.rows[i];
    const spName = `sp_${i}`;

    try {
      await client.query(`SAVEPOINT ${spName}`);

      // === 逐行处理逻辑（创建/更新员工 + 任职关系） ===
      // ...（保持现有逻辑不变）

      await client.query(`RELEASE SAVEPOINT ${spName}`);

    } catch (rowErr) {
      // 回滚到该行之前的保存点，事务恢复正常
      await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
      failedCount++;
      errors.push(`第${p.row_num}行: ${rowErr.message}`);
      // 单条失败不影响其他行，继续处理下一行
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

### 2.2 前端修复（防御性）

**问题 1：异常数据列表显示"暂无数据"**

在 `loadPendingList()` 中增加调试日志，确认接口返回的数据不为空。如果接口返回了数据但前端未渲染，检查 `pendingColumns` 的 `dataIndex` 与后端返回字段的一致性。

**问题 2：入库前缺少拦截**

在 `openImportConfirm()` 函数中增加拦截逻辑：

```ts
function openImportConfirm() {
  if (!currentBatch.value) return;
  
  // 检查是否有未审核的异常数据
  const pendingItems = pendingList.value.filter(p => p.status === 'pending');
  
  if (pendingItems.length > 0) {
    Modal.warning({
      title: '存在未审核的异常数据',
      content: `当前批次有 ${pendingItems.length} 条异常数据处于"待审核"状态。请先完成审核（通过/拒绝）后再执行入库，或系统将仅入库已通过 (approved) 的记录。`,
      okText: '我知道了',
    });
    return;
  }
  
  // 检查是否有可入库的数据
  const approvedItems = pendingList.value.filter(p => p.status === 'approved');
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

### 2.3 后端错误提示转换

当前错误直接透传 `err.message` 给前端，应转换为用户可读的提示：

```js
// 在 catch 块中
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

---

## 3. 修改范围

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `server/routes/hse-employee-import-v2.js` | 入库事务改为 SAVEPOINT 逐行保护 | **P0** |
| `server/routes/hse-employee-import-v2.js` | 增加错误提示转换函数 | P1 |
| `views/hse/employee-import-v2/index.vue` | 入库前增加拦截逻辑 | P1 |
| `views/hse/employee-import-v2/index.vue` | 修复异常数据列表显示 | P0 |

---

## 4. 验证清单

- [ ] 构造一条包含非法数据（如超长文本）的 pending 记录，确认入库后该行被跳过，其他行正常入库
- [ ] 入库完成后，批次状态正确（全部成功→completed，部分失败→partial_completed）
- [ ] 失败的 pending 记录状态保持原样，未被错误标记为 imported
- [ ] 错误信息在前端以用户可读的中文提示展示
- [ ] 存在未审核异常数据时，点击"确认入库"应弹出警告提示

> 编制：Senior Developer（高级开发工程师）