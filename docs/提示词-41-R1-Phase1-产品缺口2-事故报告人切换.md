# 提示词 41：产品缺口 #2 — accidents reporter 切换 EmployeeSelector

> 编号：提示词-41
> 日期：2026-07-30
> 状态：待执行
> 前置：提示词-40 执行报告 ✅（主档案页已落地，后端冒烟通过）
> 关联：`提示词-40-R1-Phase1-产品主线回归.md`、`R1-Phase1-终态报告.md`

---

## 0. 背景

当前事故模块（accidents）中，`handlerId`（处理人员）已切换为 `EmployeeSelector`，但 `reporter`（报告人）仍为纯文本 `<Input>`。这是「花名册为基石打通各模块交互」中最后一个仍使用纯文本的人员字段。

**目标**：将 `reporter` 从纯文本 Input 切换为 `EmployeeSelector`（与 `handlerId` 同模式），实现事故模块全部人员字段的类型安全选人。

---

## 1. 现状分析

### 1.1 当前 reporter 字段的数据流

```
前端表单：<Input v-model:value="accidentForm.reporter" />  → 纯文本
后端接收：req.body.reporter → 文本
数据库列：accidents.reporter → VARCHAR（文本存储）
后端返回：formatRow → reporter: row.reporter → 文本
前端展示：详情/列表直接显示 reporter 文本
```

### 1.2 要达成的目标数据流

```
前端表单：<EmployeeSelector v-model:value="accidentForm.reporterId" />  → 员工 ID
          @change → 同步 reporter 姓名到 accidentForm.reporter
后端接收：req.body.reporterId → 数字 ID
         req.body.reporter → 文本（兼容保留）
数据库列：accidents.reporter_id → INTEGER FK → employee.id（新增列）
         accidents.reporter → VARCHAR（保留，兼容旧数据）
后端返回：formatRow → reporterId: row.reporter_id（camelCase）
                     reporter: row.reporter（文本兜底）
前端展示：详情/列表 → <EmployeeName :employee-id="record.reporterId" />
           v-else → 文本兜底 record.reporter
```

### 1.3 与 handlerId 的对照

| 维度 | handlerId（已实现） | reporterId（本次） |
|------|---------------------|---------------------|
| 前端表单 | `EmployeeSelector` | `EmployeeSelector`（同模式） |
| 前端 onChange | `accidentForm.handler = item?.name` | `accidentForm.reporter = item?.name` |
| 后端 INSERT | `handler_id` 列 | `reporter_id` 列（新增） |
| 后端 UPDATE | `COALESCE($28, handler_id)` | `COALESCE($N, reporter_id)` |
| 后端 formatRow | `handlerId: row.handler_id` | `reporterId: row.reporter_id` |
| 前端展示 | `<EmployeeName :employee-id>` | `<EmployeeName :employee-id>` |
| 前端类型 | `AccidentItem.handlerId` | `AccidentItem.reporterId`（新增） |

---

## 2. 任务 A：数据库迁移（新增 reporter_id 列）

### 2.1 迁移脚本

新建 `server/sql/hse_accidents_reporter_id.sql`：

```sql
-- ============================================================
-- 迁移：accidents 表新增 reporter_id 列
-- 日期：2026-07-30
-- 编号：R1-Phase2-01
-- 类型：DDL（新增列 + FK + 索引）
-- ============================================================

-- 步骤 1：新增列
ALTER TABLE accidents
  ADD COLUMN IF NOT EXISTS reporter_id INTEGER;

-- 步骤 2：外键约束
ALTER TABLE accidents
  ADD CONSTRAINT fk_accidents_reporter_employee
  FOREIGN KEY (reporter_id) REFERENCES employee(id)
  ON DELETE SET NULL;

-- 步骤 3：索引
CREATE INDEX IF NOT EXISTS idx_accidents_reporter_id
  ON accidents(reporter_id);

-- 步骤 4：验证
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'accidents'
  AND column_name IN ('reporter_id', 'reporter');
```

### 2.2 回填策略（可选，P2）

历史数据中 `reporter` 文本可能包含员工姓名，可参照 R1-Phase1 四级回填策略尝试匹配。但基于 Dry Run R2 经验（回填命中率 0%），建议本次**不执行回填**，保持 `reporter_id = NULL`，前端通过 `v-else` 文本兜底。

> 若需回填，参照 `hse_employee_master_v68_extension.sql` 的四级策略（编号→数字ID→姓名→模糊），但 P0-3 实测命中率为 0%，投入产出比低。

---

## 3. 任务 B：后端修改（`server/routes/accidents.js`）

### 3.1 `formatRow` 函数

在 `formatRow` 中新增 `reporterId` 字段：

```diff
  return {
    // ... existing fields ...
    handlerId: row.handler_id,
+   reporterId: row.reporter_id,   // 报告人员工 ID（新增）
    reporter: row.reporter,
    // ... rest ...
  };
```

### 3.2 INSERT 语句

在 INSERT 列列表和 VALUES 中新增 `reporter_id`：

```diff
  INSERT INTO accidents (
    -- ... existing columns ...
    handler_id,
+   reporter_id,
    reporter,
    -- ... rest ...
  ) VALUES (
    -- ... existing values ...
    $N,   -- handler_id 位置
+   $M,   -- reporter_id（新增）
    $O,   -- reporter 文本（保留，向后兼容）
    -- ... rest ...
  )
```

### 3.3 UPDATE 语句

在 `setClauses` 中新增 `reporter_id` 更新：

```diff
  if (body.reporterId !== undefined) {
+   setClauses.push(`reporter_id = COALESCE($${paramIdx}, reporter_id)`);
+   params.push(body.reporterId);
  }
```

> 注意：`reporter` 文本字段的更新逻辑保持不变（保留向后兼容）。

### 3.4 验证

- `node --check server/routes/accidents.js` 语法通过
- 实时冒烟：
  - `POST /api/hse/accidents` 创建事故（含 `reporterId`），确认 `reporter_id` 正确写入
  - `GET /api/hse/accidents/:id` 返回含 `reporterId` 字段
  - `PUT /api/hse/accidents/:id` 更新 `reporterId`，确认正确更新

---

## 4. 任务 C：前端修改

### 4.1 API 类型补全（`src/api/hse/accidents.ts`）

```diff
  export interface AccidentItem {
    // ... existing fields ...
    handlerId?: number | null;
+   /** R1-Phase2：报告人员工 ID */
+   reporterId?: number | null;
    reporter?: string;
    // ... rest ...
  }
```

### 4.2 表单切换（`src/views/accidents/index.vue`）

#### 4.2.1 表单字段声明

```diff
  const accidentForm = reactive({
    // ... existing fields ...
    handlerId: null as number | null,
+   reporterId: null as number | null,
    reporter: '',
    // ... rest ...
  });
```

#### 4.2.2 模板替换

将 reporter 的纯文本 Input 替换为 EmployeeSelector：

```diff
- <FormItem label="报告人">
-   <Input v-model:value="accidentForm.reporter" placeholder="请输入报告人姓名" />
- </FormItem>
+ <FormItem label="报告人">
+   <EmployeeSelector
+     v-model:value="accidentForm.reporterId"
+     placeholder="选择报告人"
+     @change="onReporterChange"
+   />
+ </FormItem>
```

#### 4.2.3 onChange 处理

新增 `onReporterChange` 函数（与 `onHandlerChange` 同模式）：

```typescript
function onReporterChange(item: EmployeeSelectorApi.SelectorItem | undefined) {
  accidentForm.reporter = item?.name || '';
}
```

#### 4.2.4 编辑回填

```diff
  // 编辑事故时回填
  accidentForm.reporterId = currentAccident.reporterId ?? null;
  accidentForm.reporter = currentAccident.reporter || '';
```

#### 4.2.5 重置表单

```diff
  function resetAccidentForm() {
    // ... existing resets ...
    accidentForm.reporterId = null;
    accidentForm.reporter = '';
  }
```

#### 4.2.6 保存提交

```diff
  const data: Partial<AccidentItem> = {
    // ... existing fields ...
    handlerId: accidentForm.handlerId,
+   reporterId: accidentForm.reporterId,
    reporter: accidentForm.reporter,
    // ... rest ...
  };
```

### 4.3 详情展示切换（`accidents/index.vue` 详情模态框）

将报告人展示从纯文本切换为 EmployeeName：

```diff
- <DescriptionsItem label="报告人">{{ currentAccident.reporter || '-' }}</DescriptionsItem>
+ <DescriptionsItem label="报告人">
+   <EmployeeName v-if="currentAccident.reporterId" :employee-id="currentAccident.reporterId" />
+   <span v-else>{{ currentAccident.reporter || '-' }}</span>
+ </DescriptionsItem>
```

### 4.4 列表展示（如列表列中含报告人）

如果事故列表的表格列中展示了报告人，同样切换为 EmployeeName（有 ID 时）+ 文本兜底：

```diff
  <template v-else-if="column.key === 'reporter'">
+   <EmployeeName v-if="record.reporterId" :employee-id="record.reporterId" />
+   <span v-else>{{ record.reporter || '-' }}</span>
  </template>
```

---

## 5. 验证清单

### 5.1 数据库

- [ ] D-1 `ALTER TABLE accidents ADD COLUMN reporter_id` 执行成功
- [ ] D-2 FK 约束 `fk_accidents_reporter_employee` 创建成功
- [ ] D-3 索引 `idx_accidents_reporter_id` 创建成功

### 5.2 后端

- [ ] B-1 `node --check server/routes/accidents.js` 语法通过
- [ ] B-2 `POST /api/hse/accidents` 创建事故（含 `reporterId`），`reporter_id` 正确写入
- [ ] B-3 `GET /api/hse/accidents/:id` 返回含 `reporterId`（camelCase）
- [ ] B-4 `PUT /api/hse/accidents/:id` 正确更新 `reporter_id`
- [ ] B-5 不传 `reporterId` 时（旧客户端兼容），`reporter_id` 保持 NULL 不报错

### 5.3 前端

- [ ] F-1 `vue-tsc` accidents 相关无新增类型错误
- [ ] F-2 创建事故时，报告人字段为 EmployeeSelector（非纯文本 Input）
- [ ] F-3 选择报告人后，`reporter` 文本同步更新
- [ ] F-4 编辑事故时，`reporterId` 正确回填到 EmployeeSelector
- [ ] F-5 事故详情中，报告人显示为 EmployeeName（有 ID 时可点击）
- [ ] F-6 事故详情中，报告人无 ID 时显示文本兜底
- [ ] F-7 事故列表（如有报告人列）显示 EmployeeName + 文本兜底
- [ ] F-8 处理人员（handlerId）选择/回填/展示不受影响（回归）
- [ ] F-9 其他事故字段（标题/类型/日期/描述等）不受影响（回归）

### 5.4 红线

- [ ] 不修改路由定义
- [ ] 不修改菜单配置
- [ ] 不修改组件库
- [ ] 不修改其他模块代码
- [ ] 不修改登录代码
- [ ] 不破坏现有事故功能（创建/编辑/删除/详情/列表/导出）

---

## 6. 执行顺序

```
1. 任务 A：数据库迁移（新增 reporter_id 列 + FK + 索引）
   ↓
2. 任务 B：后端修改（formatRow + INSERT + UPDATE）
   ↓ 语法校验 + 冒烟通过
3. 任务 C：前端修改（API 类型 + 表单切换 + 详情展示 + 列表展示）
   ↓ vue-tsc 通过
4. 全链路回归验证（9 项前端 + 5 项后端 + 3 项数据库）
```

---

## 7. 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| `reporter_id` 外键约束导致旧数据插入失败 | 低 | `ON DELETE SET NULL`，`reporter_id` 允许 NULL |
| 旧客户端不传 `reporterId` 导致 INSERT 报错 | 低 | 后端 `reporterId` 可选，不传时值为 NULL |
| 前端 `as any` 残留（`accidents/index.vue:1147`） | 低 | 不在本次范围，`newStatus as any` 不影响 reporter 功能 |
| 回填命中率低 | 极低 | 本次不执行回填，`reporter_id = NULL` 时前端文本兜底 |

---

## 8. 范围外（后续独立任务）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | WS 轮询兜底实现（30s 轮询） | P2 |
| 2 | 回填策略增强 v1.2（多人员拆分、模糊匹配） | P2 |
| 3 | 全项目 TS 存量错误清零（576 处） | P2 |
| 4 | reporter 历史数据回填 | P2（可选，投入产出比低） |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`提示词-40-R1-Phase1-产品主线回归.md`、`提示词-40-执行报告.md`、`R1-Phase1-终态报告.md`