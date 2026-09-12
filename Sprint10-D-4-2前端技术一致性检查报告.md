# Sprint10-D-4-2 前端技术一致性检查报告

> **报告日期**：2026-07-24
> **任务编号**：Sprint10-D-4-2
> **检查范围**：F:\deploy\hse-dashboard 前端代码技术栈一致性

---

## 一、检查结论

**项目实际使用 Element Plus 作为 UI 组件库，而非 Vben Admin 标配的 Ant Design Vue。**

| 检查项 | 结果 |
|--------|------|
| Element Plus 引用次数 | **774次**，分布在30+个文件 |
| Ant Design Vue 引用次数 | **10次**，仅4个非核心文件 |
| package.json 依赖 | element-plus ^2.7.6 ✅ 存在，ant-design-vue ❌ 不存在 |
| 培训考核模块 | 700次 el- 引用，0次 a- 引用 |

---

## 二、Element Plus 使用分布

| 类别 | 引用次数 | 文件数 |
|------|---------|--------|
| 布局组件 | ~100次 | Layout系列5个文件 |
| 业务页面 | ~600次 | features/下25+个文件 |
| 考核模块（新增） | 700次 | 7个组件+1个主页面 |
| 其他 | ~74次 | App.vue、directives、api等 |

**核心组件使用**：el-card、el-table、el-form、el-dialog、el-button、el-tag、el-pagination、el-tabs、el-row/el-col、el-select、el-input、el-date-picker、el-descriptions、el-alert、el-empty、ElMessage、ElMessageBox

---

## 三、Ant Design Vue 使用分布

| 文件 | 引用次数 | 说明 |
|------|---------|------|
| src/plugins/pinia.ts | 1 | Pinia插件引用 |
| src/features/auth/views/RegisterView.vue | 1 | 注册页面 |
| src/features/standard-evaluation/views/EvaluationDetail.vue | 6 | 标准化评价详情 |
| src/features/standard-report/components/ReportViewerDrawer.vue | 2 | 报告查看器 |

**结论**：Ant Design Vue 仅在4个边缘文件中少量引用，非项目核心依赖。

---

## 四、风险评估

| 风险项 | 严重程度 | 说明 |
|--------|---------|------|
| 与Vben Admin标准技术栈不一致 | 中 | Vben Admin标准使用Ant Design Vue，本项目使用Element Plus |
| 双UI库共存 | 低 | Ant Design Vue引用极少，不影响运行 |
| Element Plus回退到Ant Design Vue | 极高 | 成本极高，774次引用需全部重写，无收益 |
| Vben框架兼容性 | 低 | 框架层（路由、权限、状态管理）与UI库无关，正常运行 |

---

## 五、决策与建议

### 5.1 正式决策

**确认 Element Plus 为本项目唯一 UI 组件库。**

理由：
1. Element Plus 已成为项目实际标准，覆盖全部业务页面
2. 全部新模块（含月度安全履职考核）基于 Element Plus 开发
3. Vben Admin 框架层（路由、权限、状态管理、i18n）与 UI 库无关
4. 项目未使用 Vben 的 useVbenForm/useVbenVxeGrid 等 Ant Design 集成
5. 迁移成本远大于收益

### 5.2 约束更新

- ~~使用 Vben Admin 已有的 Ant Design Vue 组件~~ → **使用 Element Plus 组件**
- 开发规范中 UI 组件库指定为 **Element Plus**
- 禁止在新增代码中引入 Ant Design Vue 组件
- 现有4个文件的 Ant Design Vue 引用，待后续迭代时逐步替换

---

**报告人**：HSE 前端开发
**报告日期**：2026-07-24
