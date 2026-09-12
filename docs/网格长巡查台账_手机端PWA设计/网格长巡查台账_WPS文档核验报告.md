# 网格长巡查台账 · WPS 文档核验报告（2026-09-07）

> 核验对象：`https://www.kdocs.cn/l/cbj5jDkU0KRu`
> 核验方式：经 WorkBuddy 金山文档连接器实测读取（非凭空推测）。
> 核验目的：确认该文档的**类型**与**列结构**是否和现有 PG 表 `grid_inspection_records`（23 字段）对得上。

## 1. 文档类型

| 项 | 实测值 |
|---|---|
| 文件名 | `2026-09-新版.xlsx` |
| 后缀 | `.xlsx`（**普通表格**，非多维表格） |
| file_id | `fvEY4o9QH9M8soRdqmy91xPE7MvU3TMLX` |
| drive_id | `882441249` |

⚠ **与方案文档初始假设不同**：此前骨架推荐"多维表格 dbsheet"，但该文档实为 **xlsx 普通表格**，
同步时 `DOC_TYPE` 必须设为 `'sheet'`（dbsheet 系列工具对它无效）。骨架 `config.js` 已据此修正。

## 2. 列结构（实测表头，21 列）

文档**按"日"分块累积**：每天一块，每块含「标题行(每日"三违"检查汇总) + 20 列表头 + 当日 N 行 + 一行"总计"」，
**没有全表统一表头**。真实数据列序：

```
序号 | 昵称 | 分组名称 | 姓名 | 所属岗位 | 网格等级 | 日期
| 三违照片：图片1 | 三违照片：图片2 | 三违照片：图片3
| 三违行为 | 违章人姓名 | 违章人性别 | 违章人年龄
| 整改后照片：图片1 | 当日是否报名 | 标记 | 是否补交 | 提交时间 | 编号 | 来源日期
```

## 3. 与 PG 23 字段对照

| PG 字段 | WPS 列 | 是否对得上 |
|---|---|---|
| area_team | 分组名称 | ✅ |
| inspection_date | 日期 | ⚠ 格式/时区不同 |
| personnel_name | 姓名 | ✅ |
| grid_level | 网格等级 | ✅ |
| position | 所属岗位 | ✅ |
| violator_name | 违章人姓名 | ✅ |
| violator_gender | 违章人性别 | ✅ |
| violator_age | 违章人年龄 | ✅ |
| violation_behavior | 三违行为 | ✅ |
| rectified_photo | 整改后照片：图片1 | ⚠ 图片结构不同 |
| image_content | 三违照片：图片1~3 | ⚠ 图片结构不同 |
| nickname | 昵称 | ✅ |
| signup_today | 当日是否报名 | ✅ |
| marker | 标记 | ✅ |
| is_resubmit | 是否补交 | ✅ |
| serial_no | 编号 | ✅（可作 upsert 键）|
| upload_time | 提交时间 | ➖ 近似 |
| id | — | ❌ 无列（用 serial_no 替代）|
| vehicle_type | — | ❌ 无列 |
| report_status | — | ❌ 无列 |
| violation_type_result | — | ❌ 无列 |
| need_rectification | — | ❌ 无列 |
| rectifier | — | ❌ 无列 |
| schematic | — | ❌ 无列 |
| grid_id | — | ❌ 无列 |
| created_at / updated_at | — | ❌ 无列 |

**小结**：23 个 PG 字段中，约 **15~16 个可在 WPS 找到对应列**（其中图片、日期需格式转换）；
**8 个 PG 字段在 WPS 中完全没有对应列**（vehicle_type / report_status / violation_type_result /
need_rectification / rectifier / schematic / grid_id / id 等）。WPS 还多出"序号(每日重置)、
三违照片图片2/3、提交时间、来源日期"等 PG 没有的列。

## 4. 关键结构差异（落地前必处理）

1. **图片模型根本不同**：PG 存**文本路径**（逗号分隔，最多 3 张）；WPS 是**单元格内嵌图片 + 多列分图**
   （三违照片：图片1/2/3、整改后照片：图片1）。反向(WPS→PG)需把 WPS 内嵌图转回路径——但 WPS 导出的
   是 ks3 临时 URL（带 `Expires`，约 2026-09 过期），**不能当稳定路径**。→ 建议图片始终保持"路径"，不搬二进制。
2. **缺列字段**：上面 8 个 PG 字段在 WPS 无家。PG→WPS 单向镜像时会**丢这些字段**；
   WPS→PG 时这些字段也无法在 WPS 里编辑。
3. **日期格式/时区**：WPS `2026-09-01 15:27`（本地、无秒）；PG `2026-07-31T16:00:00.000Z`（UTC）。需归一化。
4. **非扁平布局**：文档含每日标题行、"总计"行、每日重置的"序号"。**不能整表 upsert**——
   同步需按"来源日期"分块解析，跳过标题/总计行，以"编号(serial_no)"作 upsert 键。
5. **数据时间窗可能不重叠**：WPS 文档是 **2026 年 9 月**每日填报；PG `grid_inspection_records` 现有数据多为
   **2026 年 7 月**回填。两者可能是**不同/不重叠的数据集**——需先确认 WPS 是要"替代"还是"喂入"台账。

## 5. 结论

- **类型**：可对上，但文件是 **xlsx 普通表格**，必须用 `sheet` 类工具（非 dbsheet）。骨架已修正。
- **列结构**：**基本对得上，但非 1:1**。文本类字段大多能映射；图片、缺列、日期、布局是 4 道必须处理的坎。
- **建议**：该文档更像**填报端/数据源**而非简单镜像。若坚持"PG 主库 + WPS 镜像"：
  - PG→WPS：按"来源日期"分块追加，图片保持路径、缺列字段留空；
  - WPS→PG（阶段 B）：用 serial_no 匹配回写白名单 17 字段，图片不回搬；
  - 先与用户确认 WPS 9 月数据与 PG 7 月数据的关系，再决定同步方向。

## 6. 已同步修正的骨架文件
- `server/scripts/_sync_grid_ledger_to_kdocs/config.js`：`DOC_TYPE` 改 `sheet`，`KDOCS_COLUMNS` 改真实 21 列，
  `PG_TO_KDOCS` 按实测重映射，新增 `PG_FIELDS_MISSING_IN_WPS`、`WPS_NATURAL_KEY_COL`。已通过加载校验。
