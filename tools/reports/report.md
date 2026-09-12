# Excel → IndexedDB → 网站 数据导入功能

**日期:** 2026-06-30 | **试点模块:** 培训模块

---

## 架构变更

```
【以前】
Excel → Python 脚本 → JS 数据文件 → 网站全局变量

【现在】
Excel → 浏览器直接读取 → IndexedDB → 网站渲染
  ↑ 不需要 Python       ↑ 不管文件名
```

## 新增文件

| 文件 | 作用 |
|------|------|
| `app/importer.js` (393行) | 通用导入引擎：Excel/JSON 解析、字段自动匹配、IndexedDB 存储 |

## 修改的文件

| 文件 | 改动 |
|------|------|
| `index.html` | 加载 `app/importer.js` |
| `modules/training.js` | 新增 `getTrainingSource()` 从 IndexedDB 读取；新增"📤 导入数据"按钮 |

## 工作原理

1. **首次加载**：`importer.js` 自动把全局 `TRAINING_DATA` 写入 IndexedDB (`training_source_v1`)
2. **日常使用**：模块从 IndexedDB 读取数据，优先于全局变量
3. **数据更新**：点击"📤 导入数据"→ 选择 JSON 文件 → 写入 IndexedDB → 自动刷新

## 后续扩展

其他模块（事故、应急、规章、风险）只需：
1. 在对应模块加 `getXxxSource()` 函数
2. 加"📤 导入数据"按钮
3. 调用 `DataImporter.importFile('moduleName', file, ...)`

每个模块约 10 行代码即可接入。
