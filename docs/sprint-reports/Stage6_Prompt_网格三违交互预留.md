# 阶段6执行指令：网格-三违数据交互预留接口

> **阶段**: 6（最后阶段）
> **前置**: 阶段5前端展示审核通过
> **关联任务**: 原需求第4条——子板块"三违管理"中的数据与子板块"网格管理"数据进行交互，预留一个口，后期优化

---

## 任务目标

在网格管理中预留一个"查看该网格三违记录"的入口，后期再完善真实数据联调。要求：
1. UI入口可见可用（按钮可点、弹窗可开）
2. 数据使用mock/占位数据
3. 代码中有明确TODO标记，说明后期优化方向
4. 不修改三违管理现有代码

---

## 具体实现

### 1. 网格列表操作列增加"三违记录"按钮

文件：`src/views/inspection/grid/index.vue`

在操作列（bodyCell #action）中，在"查看"、"编辑"、"删除"按钮之后，增加一个"三违记录"按钮：
- 按钮文字：三违记录
- type="link"，size="small"
- 点击后打开一个弹窗/抽屉，显示该网格关联的三违记录列表
- 颜色可以用蓝色（默认）或橙色（与三违主题呼应），不要用danger红色

### 2. 新增"三违记录"弹窗/Drawer

在grid/index.vue中新增一个Drawer或Modal（推荐Drawer，宽度600-800px，从右侧滑出）：
- 标题：`{网格名称} - 三违记录`
- 内容：一个简化的三违记录列表（表格），包含以下列：
  - 检查日期
  - 检查人
  - 违章人
  - 三违行为（截断显示，hover tooltip显示完整内容）
  - 三违类型
  - 整改状态（待整改/整改中/已整改，用Tag着色）
- 弹窗底部显示一行灰色提示文字：`数据联调开发中，当前展示为示例数据（TODO: 后期对接真实三违数据接口）`
- 关闭按钮正常关闭弹窗

### 3. Mock数据与预留接口

- 前端本地生成3-5条mock三违记录（硬编码在组件内或用computed生成），基于当前网格的name/completionRate等信息构造，不需要真实数据
- 预留一个函数占位（如 `async function loadGridViolations(gridId: number)`），函数体内写：
  ```js
  // TODO[GRID_VIOLATION_INTEGRATION]: 后期对接三违数据接口
  // 接口规划：GET /api/violations/by-grid?gridId=xxx&year=xxx&month=xxx
  // 关联逻辑：通过 grid_inspection_records.violator_name + area_team + inspection_date
  //          关联 violations 表获取该网格下的三违详情
  // 当前返回mock数据演示UI
  ```
- mock数据中包含不同整改状态的记录（待整改、已整改各至少1条），演示Tag颜色
- 弹窗打开时调用loadGridViolations，当前直接返回mock数据

### 4. 后端预留（轻量注释标记）

后端不需要新增完整接口，但在server端添加一个注释标记，说明未来接口规划：
- 在 `server/routes/violations.js`（三违管理路由文件）顶部或末尾添加注释：
  ```js
  // TODO[GRID_VIOLATION_INTEGRATION]: 预留接口
  // 未来新增 GET /violations/by-grid?gridId=&year=&month=
  // 通过 grid_inspection_records(area_team, violator_name, inspection_date)
  // 关联 violations 表，返回指定网格/时间段的三违记录列表
  ```
- 不写具体实现，只加注释标记

### 5. 注意事项

- 不要修改三违管理（violations）的任何现有功能代码
- 不要修改三违管理的列表/筛选/导入/统计等逻辑
- 仅在网格管理侧增加入口和预留
- mock数据要看起来合理（中文内容、日期格式合理、三违行为描述真实感），不要用"test1"、"xxx"之类的占位
- 阶段6是最后一个阶段，完成后不需要再预留其他阶段
- 确保TypeScript类型检查通过（本次改动的文件）

---

## 完成后交付

- 生成Markdown报告到 `g:\hse-dashboard\docs\sprint-reports\`，文件名：`Sprint_20260804_XXX_阶段6网格三违交互预留.md`
- 报告中说明：
  - 三违记录按钮位置和点击行为
  - Drawer/Modal的UI细节
  - mock数据示例（列出几条）
  - TODO标记位置和后期联调说明
  - 文件改动清单
  - 整体6个阶段的完成总结（简短回顾）
- 停止工作等待审核（这将是最终审核）
